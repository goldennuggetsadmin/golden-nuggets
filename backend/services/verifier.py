"""Decoupled, Language-Agnostic Two-Stage Transcript Verification Engine.
Performs Stage 1 Canonical Comparison (in-memory NFC normalization) and Stage 2 Forensic Audit.
"""
from typing import Dict, Any, List, Optional
import io
import hashlib
import unicodedata
import datetime
import re

EXTRACTOR_METADATA = {
    "engine": "pdfplumber",
    "version": "1.0.0",
    "settings": {
        "x_tolerance": 1.5,
        "y_tolerance": 3.0
    }
}

VERIFICATION_ENGINE_VERSION = "v1-nfc"


def _safe_canonical_normalize(text: str) -> str:
    """Normalize text ONLY in memory during verification comparison:
    - Convert CRLF to LF
    - Remove Private Use Area & invisible control characters
    - Remove raw PDF CID markers
    - Normalize Unicode to NFC without changing visible characters
    """
    if not text:
        return ""
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[\uf000-\uffff]", "", text)
    text = re.sub(r"\(cid:\d+\)", "", text)
    # Unicode NFC normalization
    return unicodedata.normalize("NFC", text).strip()


def verify_transcript(pdf_bytes: bytes, paragraphs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Verify extracted transcript against source PDF bytes.
    Returns structured verification result JSONB payload.
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    if not pdf_bytes or len(pdf_bytes) < 100:
        return {
            "verified": False,
            "exact_match_percentage": 0.0,
            "failure_reason": "Corrupted PDF",
            "verification_engine": VERIFICATION_ENGINE_VERSION,
            "transcript_version": 1,
            "verified_at": now_iso,
            "pdf_sha256": None,
            "extractor": EXTRACTOR_METADATA,
            "paragraphs": 0,
            "characters": 0,
            "differences": 1,
            "audit_report": ["PDF bytes are invalid or empty"]
        }

    # Calculate PDF SHA-256
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

    if not paragraphs:
        return {
            "verified": False,
            "exact_match_percentage": 0.0,
            "failure_reason": "Paragraph mismatch",
            "verification_engine": VERIFICATION_ENGINE_VERSION,
            "transcript_version": 1,
            "verified_at": now_iso,
            "pdf_sha256": pdf_hash,
            "extractor": EXTRACTOR_METADATA,
            "paragraphs": 0,
            "characters": 0,
            "differences": 1,
            "audit_report": ["Zero paragraphs found in transcript"]
        }

    # Extract canonical reference text from PDF directly via pdfplumber
    reference_paragraphs: List[str] = []
    try:
        from services.transcript_service import TELUGU_PDF_CID_MAP, TELUGU_FONT_GLYPH_TRANSPOSITIONS, _is_header_footer
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                raw_text = page.extract_text()
                if raw_text:
                    # Apply CID font decoding and transpositions to reference text
                    for cid, val in TELUGU_PDF_CID_MAP.items():
                        raw_text = raw_text.replace(cid, val)
                    for pat, repl in TELUGU_FONT_GLYPH_TRANSPOSITIONS:
                        raw_text = re.sub(pat, repl, raw_text)
                    for line in raw_text.split("\n"):
                        norm_line = _safe_canonical_normalize(line)
                        if norm_line and not _is_header_footer(norm_line):
                            reference_paragraphs.append(norm_line)
    except Exception as e:
        return {
            "verified": False,
            "exact_match_percentage": 0.0,
            "failure_reason": f"PDF unreadable: {str(e)}",
            "verification_engine": VERIFICATION_ENGINE_VERSION,
            "transcript_version": 1,
            "verified_at": now_iso,
            "pdf_sha256": pdf_hash,
            "extractor": EXTRACTOR_METADATA,
            "paragraphs": len(paragraphs),
            "characters": 0,
            "differences": 1,
            "audit_report": [f"Reference extraction failed: {e}"]
        }

    # Stage 1 Canonical In-Memory Comparison
    audit_report: List[Dict[str, Any]] = []
    total_chars = 0
    matched_chars = 0
    failure_reason: Optional[str] = None

    extracted_texts = [_safe_canonical_normalize(p.get("text", "")) for p in paragraphs if p.get("text")]
    ref_full = " ".join(reference_paragraphs)
    ext_full = " ".join(extracted_texts)

    ref_full = re.sub(r"\s+", " ", ref_full).strip()
    ext_full = re.sub(r"\s+", " ", ext_full).strip()

    total_chars = max(len(ref_full), len(ext_full))
    
    if total_chars == 0:
        return {
            "verified": False,
            "exact_match_percentage": 0.0,
            "failure_reason": "PDF unreadable",
            "verification_engine": VERIFICATION_ENGINE_VERSION,
            "transcript_version": 1,
            "verified_at": now_iso,
            "pdf_sha256": pdf_hash,
            "extractor": EXTRACTOR_METADATA,
            "paragraphs": len(paragraphs),
            "characters": 0,
            "differences": 1,
            "audit_report": ["Both PDF reference and extracted text are empty"]
        }

    # Character-by-Character Forensic Audit (Stage 2)
    mismatches = 0
    max_len = max(len(ref_full), len(ext_full))
    
    for i in range(max_len):
        c_ref = ref_full[i] if i < len(ref_full) else None
        c_ext = ext_full[i] if i < len(ext_full) else None

        if c_ref == c_ext:
            matched_chars += 1
        else:
            mismatches += 1
            if len(audit_report) < 50:  # Cap detailed diff items at 50 for readability
                audit_report.append({
                    "char_index": i,
                    "expected_char": c_ref,
                    "expected_unicode": f"U+{ord(c_ref):04X}" if c_ref else "END_OF_STREAM",
                    "actual_char": c_ext,
                    "actual_unicode": f"U+{ord(c_ext):04X}" if c_ext else "END_OF_STREAM",
                })

    exact_pct = round((matched_chars / total_chars) * 100.0, 3) if total_chars > 0 else 0.0
    verified = mismatches == 0 and exact_pct == 100.0

    if not verified:
        if len(paragraphs) != len(reference_paragraphs):
            failure_reason = "Paragraph mismatch"
        else:
            failure_reason = "Character mismatch"

    return {
        "verified": verified,
        "exact_match_percentage": exact_pct,
        "failure_reason": failure_reason,
        "verification_engine": VERIFICATION_ENGINE_VERSION,
        "transcript_version": 1,
        "verified_at": now_iso,
        "pdf_sha256": pdf_hash,
        "extractor": EXTRACTOR_METADATA,
        "paragraphs": len(paragraphs),
        "characters": total_chars,
        "differences": mismatches,
        "audit_report": audit_report,
    }
