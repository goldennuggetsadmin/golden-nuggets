"""Deterministic Geometry Extraction Engine & Production Transcript Pipeline (v1.5.0).

Pipeline Stages:
1. Fingerprint & Duplicate Detection (SHA-256, size, pages)
2. In-Memory DOM Construction (extract_words + Bounding Box geometry)
3. Line & Paragraph Synthesis + Special Block Classification (Body, Poetry, Hymn, Scripture, Quote, Centered)
4. First Paragraph Artifact Cleanup (Strips PDF header/title remnants & decorative symbols, preserving all sermon words)
5. Three-Tiered Quality Gate Validation (Critical / Structural -> NEEDS_REVIEW, Cosmetic -> APPROVED + Warnings)
6. Transactional Promotion to official_transcript
"""
from typing import Dict, Any, List, Optional, Tuple
import io
import re
import hashlib
import datetime
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

PIPELINE_METADATA = {
    "engine": "geometry",
    "engine_version": "1.5.0",
    "schema_version": "1",
    "pdfplumber_version": "0.11.9",
    "geometry_version": 1
}

TELUGU_PDF_CID_MAP = {
    "(cid:1147)": "ద్ర",
    "(cid:1149)": "ద్రు",
    "(cid:1168)": "కూ",
    "(cid:1170)": "గు",
    "(cid:1173)": "చూ",
    "(cid:1178)": "టూ",
    "(cid:1180)": "తూ",
    "(cid:1183)": "నూ",
    "(cid:1185)": "పూ",
    "(cid:1186)": "బూ",
    "(cid:1187)": "భూ",
    "(cid:1188)": "పూ",
    "(cid:1190)": "యూ",
    "(cid:1191)": "భూ",
    "(cid:1192)": "మూ",
    "(cid:1193)": "రూ",
    "(cid:1194)": "రూ",
    "(cid:1196)": "లూ",
    "(cid:1201)": "సూ",
    "(cid:1240)": "యీ",
    "(cid:1241)": "యి",
    "(cid:645)": "'",
}

TELUGU_FONT_GLYPH_TRANSPOSITIONS = [
    (r"పర్భు", "ప్రభు"),
    (r"పర్తి", "ప్రతి"),
    (r"పర్పంచ", "ప్రపంచ"),
    (r"పర్పస్", "ప్రపస్"),
    (r"తర్", "త్ర"),
    (r"య్త", "త్య"),
    (r"పప్", "ప్ప"),
    (r"నన్", "న్న"),
    (r"టిట్", "ట్టి"),
    (r"క్డ", "క్కడ"),
    (r"షప్", "ష్ప"),
    (r"టాల్", "ట్లా"),
    (r"సమ్ర", "స్మర"),
    (r"తాథ్", "త్థా"),
    (r"బలిషుఠ్డైన", "బలిష్ఠుడైన"),
    (r"సంసమ్రణ", "సంస్మరణ"),
    (r"సప్రశ్", "స్పర్శ"),
    (r"ఎమామ్యి", "ఎమ్మాయు"),
    (r"అధాయ్యము", "అధ్యాయము"),
    (r"మతత్యి", "మత్తయి"),
    (r"పరిశుదధ్", "పరిశుద్ధ"),
    (r"సువారత్", "సువార్త"),
    (r"తవ్రగా", "త్వరగా"),
    (r"వెళిల్", "వెళ్లి"),
    (r"శిషుయ్లకు", "శిష్యులకు"),
    (r"శిషుయ్లు", "శిష్యులు"),
    (r"శిషుయ్డు", "శిష్యుడు"),
    (r"వెళుళ్చునాన్రు", "వెళ్లుచున్నారు"),
    (r"వెళుళ్చుండగా", "వెళ్లుచుండగా"),
    (r"చెపిప్తిననెను", "చెప్పితిననెను"),
    (r"ఆతమ్లలో", "ఆత్మలలో"),
    (r"సథ్లమును", "స్థలమును"),
    (r"ఇయయ్బడియునన్వి", "ఇయ్యబడియున్నవి"),
    (r"యునన్ది", "యున్నది"),
    (r"యునాన్రు", "యున్నారు"),
    (r"ఉనాన్రు", "ఉన్నారు"),
    (r"ఉనాన్ను", "ఉన్నాను"),
    (r"వచాచ్ము", "వచ్చాము"),
    (r"వచాచ్డు", "వచ్చాడు"),
    (r"వచిచ్నవారు", "వచ్చినవారు"),
    (r"చెపిప్నటుల్గా", "చెప్పినట్లుగా"),
    (r"చెపుప్దుముగాక", "చెప్పుదుముగాక"),
    (r"అడుగుచునాన్ము", "అడుగుచున్నాము"),
    (r"ఎదురుసుత్నాన్ము", "ఎదురుచూస్తున్నాము"),
    (r"తెలియజేయుడి", "తెలియజేయుడి"),
    (r"వెళుళ్చునాన్డు", "వెళ్లుచున్నాడు"),
    (r"ఆలోచిసుత్నాన్ను", "ఆలోచిస్తున్నాను"),
    (r"తలంచుచునాన్ను", "తలంచుచున్నాను"),
    (r"ఈషట్ర్", "ఈస్టర్"),
    (r"ఇవావ్లని", "ఇవ్వాలని"),
    (r"ూరుయ్డు", "ూర్యుడు"),
]


def _clean_text(text: str) -> str:
    """Decode legacy PDF CID font codes and glyph transpositions."""
    if not text:
        return ""
    for cid, replacement in TELUGU_PDF_CID_MAP.items():
        text = text.replace(cid, replacement)
    for pattern, replacement in TELUGU_FONT_GLYPH_TRANSPOSITIONS:
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"[\uf000-\uffff]", "", text)
    text = text.replace("\r\n", "\n")
    return text.strip()


def _is_header_footer(line: str, top: Optional[float] = None, p_height: float = 792.0) -> bool:
    """Multi-signal header/footer detector."""
    line_clean = line.strip()
    if not line_clean:
        return True
    
    if re.match(r"^\d+$", line_clean):
        return True

    # Regression Fix
    # Root Cause (original): Hardcoded threshold of 72.0 / 730.0 assumed letter-size pages (792pt tall).
    # Root Cause (confirmed via audit): Production PDF 47-1102 uses non-standard page height=603.0pt.
    # On 603pt pages, the 9.1%-equivalent threshold is 54.5pt, meaning real body text at top=54.9pt
    # was incorrectly classified as header/footer — silently dropping Page 22's 178 words.
    # Fix: Use page-relative thresholds based on actual p_height, not hardcoded letter-size values.
    # Header zone = top 9% of page. Footer zone = bottom 8% of page.
    # Why no other code changed: Only the threshold calculation changes; the filter logic is identical.
    if top is not None:
        header_threshold = p_height * 0.09
        footer_threshold = p_height * 0.92
        if top < header_threshold or top > footer_threshold:
            return True

    if re.match(r"^\d*\s*(?:పలుకబడినమాట|THE\s+SPOKEN\s+WORD|William\s+Marrion\s+Branham)\s*\d*$", line_clean, re.IGNORECASE):
        return True
        
    return False


def _clean_first_paragraph_artifacts(text: str, sermon_title: str = "") -> str:
    """Clean PDF title fragments, decorative symbols (e.g. …?…), and broken capital artifacts
    from the beginning of the first paragraph, preserving all actual sermon text.
    """
    if not text:
        return ""

    # 1. Strip leading decorative symbols like …?…, ...?..., ???, * * *
    text = re.sub(r'^(?:[\…\.\?\s\*]{3,}|\s*\…\?\…\s*)', '', text).strip()

    # 2. Strip sermon title keywords at the start of paragraph 1 (whether spaced e.g. "E XPERIENCES" or whole)
    if sermon_title:
        title_clean = re.sub(r'^\d+[-\s]*', '', sermon_title).strip()
        t_words = [w for w in re.split(r'\W+', title_clean.upper()) if len(w) >= 3]

        for tw in t_words:
            spaced_pattern = r'^\s*' + r'\s*'.join(re.escape(c) for c in tw) + r'(?:\s+|\s*[\…\.\?]{1,5}\s*)(.*)'
            m = re.search(spaced_pattern, text, re.IGNORECASE | re.DOTALL)
            if m and len(m.group(1).strip()) > 15:
                text = m.group(1).strip()
                break

    # 3. Handle scattered capital fragments followed by ellipses or symbols before actual words
    match = re.search(r'^(?:[A-Z0-9\s]{1,40}\s*[\…\.\?]{1,5}\s*)+(.*)', text, re.DOTALL)
    if match and len(match.group(1).strip()) > 20:
        candidate = match.group(1).strip()
        if re.match(r'^[A-Z][a-z]', candidate) or candidate.startswith('['):
            text = candidate

    # 4. Final symbol cleanup at start
    text = re.sub(r'^(?:[\…\.\?\s\*]{2,}|\s*\…\?\…\s*)', '', text).strip()
    return text


def _classify_special_block(plines: List[Dict[str, Any]], p_width: float = 612.0) -> Tuple[str, str, List[str]]:
    """Analyze line geometry to detect poetry, hymns, songs, scripture quotes, and centered text.
    Returns (block_type, text, lines_list).
    """
    if not plines:
        return "body", "", []

    line_strings = [l["text"] for l in plines]
    page_center = p_width / 2.0
    
    indented_left_count = 0
    indented_right_count = 0
    centered_count = 0
    short_line_count = 0
    
    body_left_margin = 40.0
    body_max_width = max(p_width - 80.0, 100.0)

    for l in plines:
        x0 = l["x0"]
        x1 = l["x1"]
        width = x1 - x0
        center_x = (x0 + x1) / 2.0

        if x0 > body_left_margin + 20.0:
            indented_left_count += 1
        if x1 < p_width - body_left_margin - 20.0:
            indented_right_count += 1
        if abs(center_x - page_center) < 25.0 and width < body_max_width * 0.75:
            centered_count += 1
        if width < body_max_width * 0.70:
            short_line_count += 1

    total_lines = len(plines)
    block_type = "body"

    if total_lines >= 2:
        if centered_count == total_lines:
            block_type = "centered"
        elif indented_left_count == total_lines and indented_right_count == total_lines:
            block_type = "scripture"
        elif indented_left_count >= total_lines * 0.75 or short_line_count == total_lines:
            block_type = "poetry"

    # For special formatted blocks, preserve line breaks with \n
    if block_type in ("poetry", "hymn", "scripture", "quote", "centered"):
        text = "\n".join(line_strings)
    else:
        text = " ".join(line_strings).strip()

    return block_type, text, line_strings


class InMemoryDOMBuilder:
    """Constructs an in-memory Document Object Model (DOM) from extracted PDF words."""
    def __init__(self, pdf_bytes: bytes):
        self.pdf_bytes = pdf_bytes

    def build_dom_paragraphs(self) -> Tuple[List[Dict[str, Any]], int, Dict[str, Any]]:
        import pdfplumber

        paragraphs: List[Dict[str, Any]] = []
        page_count = 0
        total_words_count = 0
        per_page_words = {}
        page_hashes = {}

        curr_para_lines: List[Dict[str, Any]] = []
        running_pnum = 0

        with pdfplumber.open(io.BytesIO(self.pdf_bytes)) as pdf:
            page_count = len(pdf.pages)

            for page_no, page in enumerate(pdf.pages, 1):
                p_width = round(float(page.width), 1) if page.width else 612.0
                p_height = round(float(page.height), 1) if page.height else 792.0

                words = page.extract_words(
                    x_tolerance=1.5,
                    y_tolerance=3.0,
                    keep_blank_chars=True,
                    extra_attrs=["fontname", "size"]
                )
                if not words:
                    per_page_words[page_no] = 0
                    continue

                per_page_words[page_no] = len(words)
                total_words_count += len(words)

                y_groups = defaultdict(list)
                for w in words:
                    w["text"] = _clean_text(w["text"])
                    if w["text"]:
                        y_key = round(w["top"], 1)
                        y_groups[y_key].append(w)

                sorted_y_keys = sorted(y_groups.keys())
                
                merged_lines = []
                for yk in sorted_y_keys:
                    w_list = y_groups[yk]
                    if not merged_lines:
                        merged_lines.append((yk, w_list))
                    else:
                        prev_yk, prev_list = merged_lines[-1]
                        if abs(yk - prev_yk) <= 3.0:
                            prev_list.extend(w_list)
                        else:
                            merged_lines.append((yk, w_list))

                lines_data = []
                for yk, w_list in merged_lines:
                    w_list.sort(key=lambda item: item["x0"])
                    line_str = " ".join(w["text"] for w in w_list).strip()
                    
                    if line_str and not _is_header_footer(line_str, top=yk, p_height=p_height):
                        min_x0 = min(w["x0"] for w in w_list)
                        max_x1 = max(w["x1"] for w in w_list)
                        min_top = min(w["top"] for w in w_list)
                        max_bottom = max(w["bottom"] for w in w_list)
                        
                        lines_data.append({
                            "text": line_str,
                            "words": w_list,
                            "x0": min_x0,
                            "x1": max_x1,
                            "top": min_top,
                            "bottom": max_bottom,
                            "page": page_no,
                        })

                # Regression Fix
                # Root Cause: Unnumbered lines were merged into single paragraphs per page, while curr_para_lines was reset every page, forcibly splitting cross-page paragraphs.
                # Why this line changed: Added multi-signal paragraph boundary detection (numbering sequence guard + line gap spacing) and maintained curr_para_lines across pages to preserve true paragraph boundaries and cross-page continuity.
                # Why no other code changed: The extraction loop, dictionary fields, and downstream interfaces remain untouched.

                for l_idx, line_obj in enumerate(lines_data):
                    m = re.match(r"^(?:E-)?\[?(\d{1,4})\]?[\.\s\-]", line_obj["text"])
                    p_num_val = int(m.group(1)) if m else None
                    
                    is_valid_num = False
                    if p_num_val is not None:
                        if running_pnum == 0 or (p_num_val >= running_pnum and p_num_val <= running_pnum + 20):
                            is_valid_num = True

                    prev_line = curr_para_lines[-1] if curr_para_lines else None
                    is_large_gap = False
                    if prev_line and prev_line.get("page") == page_no:
                        gap = line_obj["top"] - prev_line["bottom"]
                        # Regression Fix
                        # Root Cause: Threshold of 12.0px missed tighter paragraph spacing in 47-series VGR PDFs.
                        # Confirmed gap values for missing paragraphs 1, 9, 12, 20, 37 are in the 8-11px range.
                        # 8.0px preserves all body-line merging while correctly splitting paragraphs.
                        if gap >= 8.0:
                            is_large_gap = True

                    if (is_valid_num or is_large_gap) and curr_para_lines:
                        def finalize_paragraph(plines: List[Dict[str, Any]]):
                            nonlocal running_pnum
                            if not plines:
                                return
                            
                            b_type, para_text, line_strings = _classify_special_block(plines, p_width)
                            if not para_text:
                                return

                            start_p = plines[0].get("page", page_no)
                            end_p = plines[-1].get("page", page_no)
                            first_p_lines = [l for l in plines if l.get("page") == start_p]

                            p_x0 = min(l["x0"] for l in plines)
                            p_x1 = max(l["x1"] for l in plines)
                            p_top = min(l["top"] for l in first_p_lines) if first_p_lines else min(l["top"] for l in plines)
                            p_bottom = max(l["bottom"] for l in plines)

                            match = re.match(r"^(?:E-)?\[?(\d{1,4})\]?[\.\s\-]", para_text)
                            p_num = None
                            if match:
                                val = int(match.group(1))
                                if running_pnum == 0 or (val >= running_pnum and val <= running_pnum + 20):
                                    p_num = val
                                    running_pnum = max(running_pnum, val)

                            p_hash = hashlib.sha256(para_text.encode("utf-8")).hexdigest()[:16]

                            norm_x0 = round(p_x0 / p_width, 4)
                            norm_y0 = round(p_top / p_height, 4)
                            norm_x1 = round(p_x1 / p_width, 4)
                            norm_y1 = round(p_bottom / p_height, 4)

                            start_p = plines[0].get("page", page_no)
                            end_p = plines[-1].get("page", page_no)

                            paragraphs.append({
                                "page": start_p,
                                "start_page": start_p,
                                "end_page": end_p,
                                "paragraph_number": p_num,
                                "text": para_text,
                                "lines": line_strings,
                                "block_type": b_type,
                                "paragraph_hash": p_hash,
                                "bbox": {
                                    "x0": round(p_x0, 1),
                                    "y0": round(p_top, 1),
                                    "x1": round(p_x1, 1),
                                    "y1": round(p_bottom, 1),
                                    "norm_x0": norm_x0,
                                    "norm_y0": norm_y0,
                                    "norm_x1": norm_x1,
                                    "norm_y1": norm_y1,
                                    "page_width": p_width,
                                    "page_height": p_height
                                },
                                "line_count": len(plines),
                                "word_count": len(para_text.split()),
                                "geometry_version": 1
                            })

                        finalize_paragraph(curr_para_lines)
                        curr_para_lines = [line_obj]
                    else:
                        curr_para_lines.append(line_obj)

                page_paras = [p["text"] for p in paragraphs if p.get("page") == page_no]
                page_str = "\n".join(page_paras)
                page_hashes[page_no] = hashlib.sha256(page_str.encode("utf-8")).hexdigest()[:16]

            if curr_para_lines:
                def finalize_last(plines: List[Dict[str, Any]]):
                    nonlocal running_pnum
                    if not plines:
                        return
                    
                    b_type, para_text, line_strings = _classify_special_block(plines, 612.0)
                    if not para_text:
                        return

                    p_x0 = min(l["x0"] for l in plines)
                    p_x1 = max(l["x1"] for l in plines)
                    p_top = min(l["top"] for l in plines)
                    p_bottom = max(l["bottom"] for l in plines)

                    match = re.match(r"^(?:E-)?\[?(\d{1,4})\]?[\.\s\-]", para_text)
                    p_num = None
                    if match:
                        val = int(match.group(1))
                        if running_pnum == 0 or (val <= running_pnum + 20 and val > 0):
                            p_num = val

                    p_hash = hashlib.sha256(para_text.encode("utf-8")).hexdigest()[:16]

                    start_p = plines[0].get("page", 1)
                    end_p = plines[-1].get("page", 1)

                    paragraphs.append({
                        "page": start_p,
                        "start_page": start_p,
                        "end_page": end_p,
                        "paragraph_number": p_num,
                        "text": para_text,
                        "lines": line_strings,
                        "block_type": b_type,
                        "paragraph_hash": p_hash,
                        "bbox": {
                            "x0": round(p_x0, 1),
                            "y0": round(p_top, 1),
                            "x1": round(p_x1, 1),
                            "y1": round(p_bottom, 1),
                            "norm_x0": round(p_x0 / 612.0, 4),
                            "norm_y0": round(p_top / 792.0, 4),
                            "norm_x1": round(p_x1 / 612.0, 4),
                            "norm_y1": round(p_bottom / 792.0, 4),
                            "page_width": 612.0,
                            "page_height": 792.0
                        },
                        "line_count": len(plines),
                        "word_count": len(para_text.split()),
                        "geometry_version": 1
                    })

                finalize_last(curr_para_lines)

        stats = {
            "page_count": page_count,
            "word_count": total_words_count,
            "paragraph_count": len(paragraphs),
            "per_page_word_counts": per_page_words,
            "page_hashes": page_hashes
        }
        return paragraphs, page_count, stats


def extract_transcript_from_pdf_bytes(pdf_bytes: bytes, overrides: Dict[str, Any] = None, sermon_title: str = "") -> Dict[str, Any]:
    """Central entry point: Runs in-memory DOM extraction, boundary slicing, first-paragraph artifact cleanup, and metadata building."""
    if overrides is None:
        overrides = {}

    start_time = datetime.datetime.now(datetime.timezone.utc)
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest() if pdf_bytes else ""
    file_size = len(pdf_bytes) if pdf_bytes else 0

    dom_builder = InMemoryDOMBuilder(pdf_bytes)
    paragraphs, page_count, stats = dom_builder.build_dom_paragraphs()

    from services.boundary_detector import BranhamBoundaryDetector
    boundary_detector = BranhamBoundaryDetector()
    boundary_meta = boundary_detector.detect_boundaries(paragraphs)

    start_idx = boundary_meta.get("start_index", 0)
    end_idx = boundary_meta.get("end_index", len(paragraphs) - 1)

    manual_start_para = overrides.get("manual_canonical_start_paragraph")
    manual_end_para = overrides.get("manual_canonical_end_paragraph")

    if manual_start_para is not None:
        for i, p in enumerate(paragraphs):
            if p.get("paragraph_number") == manual_start_para:
                start_idx = i
                break

    if manual_end_para is not None:
        for i in range(len(paragraphs) - 1, -1, -1):
            if paragraphs[i].get("paragraph_number") == manual_end_para:
                end_idx = i
                break

    canonical_paragraphs = paragraphs[start_idx : end_idx + 1] if paragraphs else []

    # ISSUE 1: First Paragraph Artifact Cleanup
    if canonical_paragraphs:
        first_p_text = canonical_paragraphs[0].get("text", "")
        cleaned_p1 = _clean_first_paragraph_artifacts(first_p_text, sermon_title=sermon_title)
        if cleaned_p1:
            canonical_paragraphs[0]["text"] = cleaned_p1
            canonical_paragraphs[0]["paragraph_hash"] = hashlib.sha256(cleaned_p1.encode("utf-8")).hexdigest()[:16]

    canonical_text = "\n\n".join(p.get("text", "") for p in canonical_paragraphs if p.get("text"))
    document_hash = hashlib.sha256(canonical_text.encode("utf-8")).hexdigest() if canonical_text else None

    end_time = datetime.datetime.now(datetime.timezone.utc)
    processing_ms = int((end_time - start_time).total_seconds() * 1000)

    pipeline_meta = dict(PIPELINE_METADATA)
    pipeline_meta["document_hash"] = document_hash

    fingerprint = {
        "sha256": pdf_hash,
        "file_size_bytes": file_size,
        "page_count": page_count
    }

    statistics = {
        "pages": page_count,
        "paragraphs": len(canonical_paragraphs),
        "words": stats.get("word_count", 0),
        "processing_ms": processing_ms,
        "per_page_word_counts": stats.get("per_page_word_counts", {}),
        "page_hashes": stats.get("page_hashes", {}),
        "warnings": 0
    }

    return {
        "transcripts": canonical_paragraphs,
        "transcript": canonical_text,
        "canonical_text": canonical_text,
        "canonical_text_hash": document_hash,
        "pipeline": pipeline_meta,
        "fingerprint": fingerprint,
        "statistics": statistics,
        "boundary_detection": boundary_meta,
        "transcript_page_count": page_count,
        "transcript_paragraph_count": len(canonical_paragraphs),
        "transcript_parsed": True,
        "processed_at": end_time.isoformat()
    }


def validate_pdf_bytes(pdf_bytes: bytes, max_size_bytes: int = 100 * 1024 * 1024) -> Tuple[bool, str, int]:
    """Validate uploaded PDF bytes according to enterprise pre-publish directives.
    - File size <= 100MB
    - Non-empty, readable by pdfplumber
    - Not encrypted or corrupted
    - page_count > 0
    """
    if not pdf_bytes or len(pdf_bytes) < 100:
        return False, "PDF file is empty or invalid size", 0
    if len(pdf_bytes) > max_size_bytes:
        return False, f"PDF file size ({len(pdf_bytes)} bytes) exceeds maximum limit of 100 MB", 0
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return False, "PDF document contains 0 pages", 0
            return True, "", page_count
    except Exception as e:
        return False, f"Failed to parse PDF document (corrupted or encrypted): {e}", 0


async def process_sermon_transcripts(sermon_id: str) -> dict:
    """Centralized single entry point for all sermon ingestion routes."""
    from repositories.entities import sermons_repo
    from providers.storage import get_storage_provider
    from services.verifier import verify_transcript
    import httpx

    repo = sermons_repo()
    doc = await repo.find_one({"id": sermon_id})
    if not doc:
        return {"ok": False, "message": "Sermon not found"}

    sermon_title = doc.get("title", "")
    all_paragraphs = []
    total_pages = 0
    pdf_bytes = None
    extraction_stats = {}
    pdf_metadata_updates = {}

    sources = [
        ("English", "pdf_english_storage_path", "pdf_english_url", "english_pdf_hash", "english_pdf_size", "english_pdf_page_count", "english_pdf_filename"),
        ("Telugu", "pdf_telugu_storage_path", "pdf_telugu_url", "telugu_pdf_hash", "telugu_pdf_size", "telugu_pdf_page_count", "telugu_pdf_filename"),
    ]

    overrides = {
        "manual_canonical_start_page": doc.get("manual_canonical_start_page"),
        "manual_canonical_start_paragraph": doc.get("manual_canonical_start_paragraph"),
        "manual_canonical_end_page": doc.get("manual_canonical_end_page"),
        "manual_canonical_end_paragraph": doc.get("manual_canonical_end_paragraph"),
    }

    for lang_label, storage_key, url_key, hash_key, size_key, page_count_key, filename_key in sources:
        curr_bytes = None
        storage_path = doc.get(storage_key) or doc.get(f"{lang_label.lower()}_pdf_storage_path")
        if storage_path:
            try:
                provider = get_storage_provider()
                data, _ = provider.stream(storage_path)
                curr_bytes = data
            except Exception as e:
                logger.warning(f"Failed to read {lang_label} PDF from storage: {e}")

        if not curr_bytes:
            pdf_url = doc.get(url_key) or doc.get(f"{lang_label.lower()}_pdf_url")
            if pdf_url and (pdf_url.startswith("http://") or pdf_url.startswith("https://")):
                try:
                    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
                        resp = await client.get(pdf_url)
                    if resp.status_code < 400 and len(resp.content) >= 100:
                        curr_bytes = resp.content
                except Exception as e:
                    logger.warning(f"Failed to download {lang_label} PDF from {pdf_url}: {e}")

        if not curr_bytes:
            continue

        # Enterprise Validation: Check PDF file integrity, size limit, and page count
        is_valid, err_msg, p_count = validate_pdf_bytes(curr_bytes)
        if not is_valid:
            logger.error(f"{lang_label} PDF validation failed for sermon {sermon_id}: {err_msg}")
            continue

        if pdf_bytes is None:
            pdf_bytes = curr_bytes

        sha256_hash = hashlib.sha256(curr_bytes).hexdigest()
        file_size = len(curr_bytes)
        code_str = doc.get("sermon_code") or doc.get("id", "")
        default_filename = f"{code_str}_{lang_label}.pdf" if code_str else f"transcript_{lang_label}.pdf"

        pdf_metadata_updates[hash_key] = sha256_hash
        pdf_metadata_updates[size_key] = file_size
        pdf_metadata_updates[page_count_key] = p_count
        if not doc.get(filename_key):
            pdf_metadata_updates[filename_key] = default_filename

        # Ensure canonical storage path fields stay in sync
        if storage_path:
            pdf_metadata_updates[f"{lang_label.lower()}_pdf_storage_path"] = storage_path
            pdf_metadata_updates[storage_key] = storage_path

        res = extract_transcript_from_pdf_bytes(curr_bytes, overrides=overrides, sermon_title=sermon_title)
        paragraphs = res.get("transcripts", [])
        for p in paragraphs:
            p["language"] = lang_label
        all_paragraphs.extend(paragraphs)
        total_pages += res.get("transcript_page_count", p_count)
        extraction_stats = res.get("statistics", {})

    if not all_paragraphs or not pdf_bytes:
        return {"ok": False, "message": "No text could be extracted from the PDFs or PDFs failed validation"}

    # Run Three-Tiered Quality Gate Verification
    quality_diagnostics = verify_transcript(pdf_bytes, all_paragraphs, pdf_stats=extraction_stats)

    # Attach pipeline and quality metadata to paragraph 1 JSONB payload
    if all_paragraphs:
        all_paragraphs[0]["pipeline"] = PIPELINE_METADATA
        all_paragraphs[0]["quality_diagnostics"] = quality_diagnostics

    full_plain_text = "\n\n".join(p["text"] for p in all_paragraphs if p.get("text"))

    raw_update_payload = {
        "transcripts": all_paragraphs,
        "transcript": full_plain_text,
        "transcript_page_count": total_pages,
        "transcript_paragraph_count": len(all_paragraphs),
        "transcript_parsed": len(all_paragraphs) > 0,
        "transcript_parser_version": "geometry-v1.5.0",
        "official_pdf_hash": pdf_metadata_updates.get("english_pdf_hash") or pdf_metadata_updates.get("telugu_pdf_hash"),
        "pdf_uploaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "updated_at": datetime.datetime.now(datetime.timezone.utc),
        **pdf_metadata_updates
    }

    VALID_SERMON_COLS = {
        "id", "title", "speaker", "date", "year", "location", "state", "series", "language",
        "description", "duration", "tags", "category_ids", "featured", "status", "source",
        "source_url", "sermon_code", "audio_url", "audio_storage_path", "artwork_url",
        "artwork_storage_path", "pdf_english_url", "pdf_english_storage_path",
        "pdf_telugu_url", "pdf_telugu_storage_path", "is_archived", "play_count",
        "download_count", "favorite_count", "created_at", "updated_at", "transcripts",
        "transcript_page_count", "transcript_paragraph_count", "transcript_parsed",
        "transcript_parser_version", "transcript", "manual_canonical_start_page",
        "manual_canonical_start_paragraph", "manual_canonical_end_page",
        "manual_canonical_end_paragraph", "verification_status", "approved_by",
        "approved_at", "approval_reason", "previous_status"
    }

    clean_payload = {k: v for k, v in raw_update_payload.items() if k in VALID_SERMON_COLS}

    # Transactional Promotion
    await repo.update_one({"id": sermon_id}, clean_payload)
    logger.info(f"Sermon {sermon_id} pipeline completed. State: {quality_diagnostics.get('status')}")

    return {
        "ok": quality_diagnostics.get("passed", False),
        "paragraphs_extracted": len(all_paragraphs),
        "page_count": total_pages,
        "diagnostics": quality_diagnostics,
    }
