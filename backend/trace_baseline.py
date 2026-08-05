import asyncio
import os
import sys

from services.transcript_service import extract_transcript_from_pdf_bytes, InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

local_pdfs = [
    ("/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf", "53-0729 English"),
    ("/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf", "57-0421S English"),
    ("/Users/selvi.none/Desktop/ministries/ministries-1-main/backend/storage/pdf/98f882c17cef/english-878c7bfd-sample_en.pdf", "Storage Sample EN"),
    ("/Users/selvi.none/Desktop/ministries/ministries-1-main/backend/storage/pdf/98f882c17cef/telugu-b589053a-sample_te.pdf", "Storage Sample TE"),
]

def trace_pdf(path, title):
    print("=" * 80)
    print(f"BASELINE TRACE FOR: {title}")
    print(f"File Path: {path}")
    print("=" * 80)

    if not os.path.exists(path):
        print("FILE NOT FOUND!")
        return

    with open(path, "rb") as f:
        pdf_bytes = f.read()

    # STAGE 1 & 2: InMemoryDOMBuilder
    dom_builder = InMemoryDOMBuilder(pdf_bytes)
    raw_paragraphs, total_pages, stats = dom_builder.build_dom_paragraphs()

    print(f"\n--- STAGE 1 & 2: Extraction & DOM Builder ---")
    print(f"Total Pages: {total_pages}")
    print(f"Total Raw Extracted Paragraphs: {len(raw_paragraphs)}")
    for i, p in enumerate(raw_paragraphs[:5]):
        print(f"  Raw [{i}] Page {p.get('page')}, Para #{p.get('paragraph_number')}: '{p.get('text')[:80]}...'")

    # STAGE 3: Boundary Detector State Trace
    detector = BranhamBoundaryDetector()
    print(f"\n--- STAGE 3: Boundary Detector State Transitions ---")
    state = "FRONT_MATTER"
    for i, p in enumerate(raw_paragraphs):
        text = p.get("text", "").lower()
        has_front = any(k in text for k in detector.VGR_FRONT_KEYWORDS)
        has_back = any(k in text for k in detector.VGR_BACK_KEYWORDS)

        old_state = state
        matched_kw = []
        if state == "FRONT_MATTER":
            if has_front:
                matched_kw = [k for k in detector.VGR_FRONT_KEYWORDS if k in text]
            else:
                state = "BODY"
        elif state == "BODY":
            if has_back:
                matched_kw = [k for k in detector.VGR_BACK_KEYWORDS if k in text]
                state = "BACK_MATTER"

        if old_state != state or matched_kw:
            print(f"  Para [{i}] Page {p.get('page')} | Num={p.get('paragraph_number')} | State: {old_state} -> {state} | Matched KW: {matched_kw} | Snippet: '{p.get('text')[:60]}...'")

    boundary_meta = detector.detect_boundaries(raw_paragraphs)
    print(f"\nBoundary Result: start_index={boundary_meta.get('start_index')}, end_index={boundary_meta.get('end_index')}, confidence={boundary_meta.get('confidence')}")

    start_idx = boundary_meta.get("start_index", 0)
    end_idx = boundary_meta.get("end_index", len(raw_paragraphs)-1)
    sliced_paragraphs = raw_paragraphs[start_idx : end_idx + 1] if raw_paragraphs else []
    print(f"Sliced Paragraph Count: {len(sliced_paragraphs)} (out of {len(raw_paragraphs)})")

    if sliced_paragraphs:
        print(f"  Sliced First: Page {sliced_paragraphs[0].get('page')}, Para #{sliced_paragraphs[0].get('paragraph_number')}: '{sliced_paragraphs[0].get('text')[:100]}...'")
        print(f"  Sliced Last:  Page {sliced_paragraphs[-1].get('page')}, Para #{sliced_paragraphs[-1].get('paragraph_number')}: '{sliced_paragraphs[-1].get('text')[:100]}...'")

    # STAGE 4 & 5: Verifier Diagnostics
    diagnostics = verify_transcript(pdf_bytes, sliced_paragraphs, pdf_stats=stats)
    print(f"\n--- STAGE 4 & 5: Verifier Output ---")
    print(f"Status: {diagnostics.get('status')}, Passed: {diagnostics.get('passed')}")
    print(f"Critical Failures: {diagnostics.get('critical_failures')}")
    print(f"Structural Issues: {diagnostics.get('structural_issues')}")
    print(f"Cosmetic Warnings: {diagnostics.get('cosmetic_warnings')}")
    print("\n\n")

if __name__ == "__main__":
    for path, title in local_pdfs:
        trace_pdf(path, title)
