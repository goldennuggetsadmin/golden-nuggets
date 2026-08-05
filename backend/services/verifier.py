"""Decoupled, Three-Tiered Transcript Verification & Quality Gate Engine (v1.4.0).

Enforces:
1. Source Consistency Validator (Per-page & Document word density ratio comparison against raw PDF stream)
2. Duplicate Paragraph Detector (Hash-based consecutive duplicate check)
3. Collapsed Word Detection
4. Vertical Reading Order & Geometry Bounding Box Sanity
5. Monotonic Paragraph Number Sequence
6. Running Header/Footer Leak Filter
"""
from typing import Dict, Any, List, Optional, Tuple
import io
import hashlib
import unicodedata
import datetime
import re
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

VERIFIER_ENGINE = {
    "name": "quality_gate",
    "version": "1.4.0",
    "schema_version": "1"
}


def _safe_canonical_normalize(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[\uf000-\uffff]", "", text)
    text = re.sub(r"\(cid:\d+\)", "", text)
    return unicodedata.normalize("NFC", text).strip()


def check_source_consistency(pdf_stats: Dict[str, Any], paragraphs: List[Dict[str, Any]]) -> List[str]:
    """Per-Page and Document Source Consistency Validator."""
    issues = []
    total_pdf_words = pdf_stats.get("word_count", 0)

    ext_words = sum(p.get("word_count", len(p.get("text", "").split())) for p in paragraphs)
    word_ratio = ext_words / max(total_pdf_words, 1)

    if total_pdf_words > 100 and word_ratio < 0.70:
        issues.append(f"Document Source Consistency Failure: Extracted word ratio critically low ({round(word_ratio*100, 1)}% of PDF raw stream)")

    page_ext_words = defaultdict(int)
    for p in paragraphs:
        page_ext_words[p.get("page", 1)] += p.get("word_count", len(p.get("text", "").split()))

    page_pdf_words = pdf_stats.get("per_page_word_counts", {})
    # Only enforce per-page density check on pages within the sermon body (between start_page and end_page)
    # Ignore front-matter and back-matter pages that were intentionally sliced by the boundary detector.
    body_pages = set(p.get("page", 1) for p in paragraphs) if paragraphs else set()
    if body_pages:
        min_body_page = min(body_pages)
        max_body_page = max(body_pages)
        for pg, pdf_w in page_pdf_words.items():
            if min_body_page <= pg <= max_body_page and pdf_w > 50:
                ext_w = page_ext_words.get(pg, 0)
                p_ratio = ext_w / max(pdf_w, 1)
                # Allow for up to 55% header/footer/margin/partial-page slice variance on individual pages (0.45 threshold)
                # while maintaining strict document-level density threshold (0.70 / 70%).
                if p_ratio < 0.45:
                    issues.append(f"Per-Page Source Consistency Failure on Page {pg}: Extracted {ext_w} words out of {pdf_w} PDF words ({round(p_ratio*100, 1)}%)")

    return issues


def check_duplicate_paragraphs(paragraphs: List[Dict[str, Any]]) -> List[str]:
    """Detect accidental repeated paragraph blocks via hash comparison."""
    issues = []
    seen_hashes = {}
    for i, p in enumerate(paragraphs):
        p_hash = p.get("paragraph_hash") or hashlib.sha256(p.get("text", "").encode("utf-8")).hexdigest()[:16]
        if p_hash in seen_hashes:
            prev_idx = seen_hashes[p_hash]
            text_snippet = p.get("text", "")[:40]
            issues.append(f"Duplicate paragraph block detected at index {i+1} (matches index {prev_idx+1}): '{text_snippet}...'")
        else:
            seen_hashes[p_hash] = i
    return issues


def check_collapsed_words(text: str) -> List[str]:
    """Multi-signal collapsed word detector."""
    if not text:
        return []
    
    issues = []
    camel_matches = re.findall(r'\b[a-z]{2,}[A-Z][a-z]{2,}\b', text)
    for match in camel_matches[:5]:
        issues.append(f"Collapsed mixed-case word: '{match}'")
        
    punct_matches = re.findall(r'\b[a-z]{2,}[\.\,\?\!][A-Z][a-z]{2,}\b', text)
    for match in punct_matches[:5]:
        issues.append(f"Unspaced punctuation: '{match}'")
        
    long_words = [w for w in re.findall(r'\b[A-Za-z]{25,}\b', text)]
    for w in long_words[:5]:
        issues.append(f"Unusually long word (likely unspaced): '{w}'")
        
    return issues


def check_paragraph_sequence(paragraphs: List[Dict[str, Any]]) -> List[str]:
    """Check paragraph numbers strictly increase monotonically and detect missing sequence numbers (merged/skipped paragraphs)."""
    issues = []
    prev_num = 0
    for i, p in enumerate(paragraphs):
        p_num = p.get("paragraph_number")
        if p_num is not None:
            if p_num <= prev_num and prev_num > 0:
                issues.append(f"Paragraph number regression/duplicate at index {i}: #{p_num} after #{prev_num}")
            elif prev_num > 0 and p_num > prev_num + 1:
                missing_range = list(range(prev_num + 1, p_num))
                if len(missing_range) <= 5:
                    missing_str = ", ".join(f"#{m}" for m in missing_range)
                    issues.append(f"Missing paragraph(s) in sequence: {missing_str} (merged or skipped between #{prev_num} and #{p_num})")
                else:
                    issues.append(f"Sequence jump: {len(missing_range)} missing paragraphs between #{prev_num} and #{p_num}")
            prev_num = p_num
    return issues


def check_header_footer_leaks(paragraphs: List[Dict[str, Any]]) -> List[str]:
    """Detect running headers/footers leaked into body text (Cosmetic)."""
    issues = []
    header_patterns = [
        r"^(?:THE\s+SPOKEN\s+WORD|WILLIAM\s+MARRION\s+BRANHAM|VGR|VOICE\s+OF\s+GOD)\s*$",
        r"^\d+\s+(?:THE\s+SPOKEN\s+WORD|WILLIAM\s+MARRION\s+BRANHAM)\s*$",
        r"^\d+\s*$",
    ]
    for i, p in enumerate(paragraphs):
        text = p.get("text", "").strip()
        for pat in header_patterns:
            if re.match(pat, text, re.IGNORECASE):
                issues.append(f"Leaked header/footer artifact in paragraph {i+1}: '{text}'")
                break
    return issues


def check_reading_order_and_geometry(paragraphs: List[Dict[str, Any]]) -> List[str]:
    """Verify reading order (Y-coordinates increase on each page) and bbox sanity."""
    # Regression Fix
    # Root Cause: Multi-page paragraphs spanning from page N to N+1 caused vertical Y-coordinate order checks to falsely register inversions against paragraphs starting on page N.
    # Why this line changed: Grouped reading order checks by start_page and checked vertical order for paragraphs that start on the same page.
    # Why no other code changed: Diagnostic output structure and error lists remain unchanged.
    issues = []
    page_prev_y = {}

    for i, p in enumerate(paragraphs):
        start_p = p.get("start_page", p.get("page", 1))
        end_p = p.get("end_page", start_p)
        bbox = p.get("bbox", {})
        y0 = bbox.get("y0", 0)

        if start_p in page_prev_y:
            if y0 < page_prev_y[start_p] - 5.0 and start_p == end_p:
                issues.append(f"Vertical reading order inversion on page {start_p} at paragraph {i+1}: Y={y0} after Y={page_prev_y[start_p]}")
        page_prev_y[start_p] = y0

        l_count = p.get("line_count", p.get("lines_count", 1))
        w_count = p.get("word_count", len(p.get("text", "").split()))
        if l_count == 0 or w_count == 0:
            issues.append(f"Zero lines or words in paragraph {i+1} on page {start_p}")

    return issues


def verify_transcript(pdf_bytes: bytes, paragraphs: List[Dict[str, Any]], pdf_stats: Dict[str, Any] = None) -> Dict[str, Any]:
    """Three-Tiered Quality Gate Validator (Critical / Structural / Cosmetic)."""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest() if pdf_bytes else None

    critical_failures: List[str] = []
    structural_issues: List[str] = []
    cosmetic_warnings: List[str] = []

    if not pdf_bytes or len(pdf_bytes) < 100:
        critical_failures.append("Invalid or empty PDF bytes")
        
    if not paragraphs:
        critical_failures.append("Zero paragraphs extracted from document")

    if not critical_failures:
        full_text = "\n\n".join(p.get("text", "") for p in paragraphs if p.get("text"))

        # 1. Source Consistency Check (Per-Document & Per-Page) (CRITICAL)
        if pdf_stats:
            source_issues = check_source_consistency(pdf_stats, paragraphs)
            if source_issues:
                critical_failures.extend(source_issues)

        # 2. Duplicate Paragraph Check (STRUCTURAL)
        duplicate_issues = check_duplicate_paragraphs(paragraphs)
        if duplicate_issues:
            structural_issues.extend(duplicate_issues)

        # 3. Collapsed Word Check (CRITICAL)
        collapsed_issues = check_collapsed_words(full_text)
        if collapsed_issues:
            critical_failures.extend(collapsed_issues)

        # 4. Reading Order & Bounding Box Sanity (CRITICAL)
        geometry_issues = check_reading_order_and_geometry(paragraphs)
        if geometry_issues:
            critical_failures.extend(geometry_issues)

        # 5. Paragraph Number Sequence (STRUCTURAL)
        sequence_issues = check_paragraph_sequence(paragraphs)
        if sequence_issues:
            structural_issues.extend(sequence_issues)

        # 6. Header/Footer Leak Check (COSMETIC)
        leak_issues = check_header_footer_leaks(paragraphs)
        if leak_issues:
            cosmetic_warnings.extend(leak_issues)

        # 7. Text Length Sanity (CRITICAL)
        if len(full_text.strip()) < 100 and len(paragraphs) > 0:
            critical_failures.append(f"Extracted text density critically low ({len(full_text)} chars)")

    is_passed = len(critical_failures) == 0 and len(structural_issues) == 0
    status = "APPROVED_AND_FROZEN" if is_passed else "NEEDS_REVIEW"

    diagnostics = {
        "status": status,
        "passed": is_passed,
        "critical_failures_count": len(critical_failures),
        "structural_issues_count": len(structural_issues),
        "cosmetic_warnings_count": len(cosmetic_warnings),
        "critical_failures": critical_failures,
        "structural_issues": structural_issues,
        "cosmetic_warnings": cosmetic_warnings,
        "verifier_engine": VERIFIER_ENGINE,
        "pdf_sha256": pdf_hash,
        "paragraph_count": len(paragraphs),
        "character_count": sum(len(p.get("text", "")) for p in paragraphs),
        "verified_at": now_iso
    }

    return diagnostics
