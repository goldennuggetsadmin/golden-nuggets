"""VTT Timestamp Parser & Paragraph Timing Matcher.

Parses a WebVTT file and fuzzy-matches each cue's text against existing
transcript paragraphs to assign start_seconds / end_seconds timing data.

Used by: POST /api/v1/admin/sermons/{sermon_id}/upload-vtt
"""

import re
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# VTT Parsing
# ---------------------------------------------------------------------------

def _ts_to_seconds(ts: str) -> float:
    """Convert a VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to float seconds."""
    ts = ts.strip()
    parts = ts.replace(",", ".").split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def parse_vtt(content: str) -> List[Dict[str, Any]]:
    """Parse a WebVTT string and return a list of cue dicts.

    Each cue dict has:
        start_seconds  (float)
        end_seconds    (float)
        text           (str - cleaned, whitespace-normalised)
    """
    cues: List[Dict[str, Any]] = []

    # Normalise line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n")

    # Strip the WEBVTT header block
    lines = content.split("\n")
    start_idx = 0
    for i, line in enumerate(lines):
        if "-->" in line:
            start_idx = i
            break

    i = start_idx
    while i < len(lines):
        line = lines[i].strip()
        if "-->" in line:
            ts_match = re.match(
                r"(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})"
                r"\s*-->\s*"
                r"(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})",
                line,
            )
            if ts_match:
                start_s = _ts_to_seconds(ts_match.group(1))
                end_s = _ts_to_seconds(ts_match.group(2))

                # Collect text lines until next blank line or next cue
                text_lines: List[str] = []
                i += 1
                while i < len(lines):
                    tl = lines[i].strip()
                    if not tl or "-->" in tl:
                        break
                    text_lines.append(tl)
                    i += 1

                cue_text = " ".join(text_lines).strip()
                if cue_text:
                    cues.append({
                        "start_seconds": start_s,
                        "end_seconds": end_s,
                        "text": cue_text,
                    })
                continue
        i += 1

    logger.info(f"VTT parse: found {len(cues)} cues")
    return cues


# ---------------------------------------------------------------------------
# Fuzzy Text Matching
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lower-case, collapse whitespace, strip punctuation for comparison."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _token_overlap(a: str, b: str) -> float:
    """Return Jaccard similarity of word sets between two normalised strings."""
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    inter = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(inter) / len(union)


def _cue_text_in_paragraph(cue_text_norm: str, para_text_norm: str) -> bool:
    """Return True if a significant portion of cue words appear in the paragraph."""
    cue_tokens = set(cue_text_norm.split())
    para_tokens = set(para_text_norm.split())
    if not cue_tokens:
        return False
    matched = len(cue_tokens & para_tokens)
    # At least 60% of cue words must appear in the paragraph
    return matched / len(cue_tokens) >= 0.60


def match_vtt_to_paragraphs(
    cues: List[Dict[str, Any]],
    paragraphs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fuzzy-match VTT cues to transcript paragraphs and inject timing data.

    Strategy (Option 1 - Fuzzy Text Match):
    1. Normalise all paragraph texts.
    2. For each VTT cue, find which paragraph(s) contain its spoken text.
    3. The earliest cue that matches a paragraph sets its start_seconds.
    4. The latest cue that matches a paragraph sets its end_seconds.
    5. Paragraphs that receive no match are left without timing data.

    Returns a new list of paragraphs with timing injected where matched.
    """
    if not cues or not paragraphs:
        return paragraphs

    # Pre-normalise paragraph texts
    para_norms = [_normalise(p.get("text", "")) for p in paragraphs]

    # Build mapping: para_index -> {start_seconds, end_seconds}
    timing_map: Dict[int, Dict[str, float]] = {}

    for cue in cues:
        cue_norm = _normalise(cue["text"])
        best_idx: Optional[int] = None
        best_score: float = 0.0

        for idx, para_norm in enumerate(para_norms):
            # Substring containment check (fastest, most reliable)
            if cue_norm and cue_norm in para_norm:
                score = 1.0
            elif _cue_text_in_paragraph(cue_norm, para_norm):
                score = _token_overlap(cue_norm, para_norm)
            else:
                score = 0.0

            if score > best_score:
                best_score = score
                best_idx = idx

        if best_idx is not None and best_score > 0:
            entry = timing_map.setdefault(best_idx, {
                "start_seconds": cue["start_seconds"],
                "end_seconds": cue["end_seconds"],
            })
            # Expand the window: keep earliest start, latest end
            entry["start_seconds"] = min(entry["start_seconds"], cue["start_seconds"])
            entry["end_seconds"] = max(entry["end_seconds"], cue["end_seconds"])

    # Apply timing back to paragraphs
    matched_count = 0
    result = []
    for idx, para in enumerate(paragraphs):
        updated = dict(para)
        if idx in timing_map:
            updated["start_seconds"] = timing_map[idx]["start_seconds"]
            updated["end_seconds"] = timing_map[idx]["end_seconds"]
            matched_count += 1
        result.append(updated)

    logger.info(
        f"VTT matching: {matched_count}/{len(paragraphs)} paragraphs received timing "
        f"from {len(cues)} cues"
    )
    return result
