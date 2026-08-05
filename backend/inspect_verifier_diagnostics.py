"""
Inspect Verifier Diagnostics for Benchmark Sermons 53-0729 & 57-0421S
"""
import os
import io
import httpx
from services.transcript_service import InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

LOCAL_PDF_FILES = [
    ("53-0729", "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf"),
    ("57-0421S", "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf"),
]

def main():
    for name, path in LOCAL_PDF_FILES:
        print("=" * 80)
        print(f"VERIFIER DIAGNOSTICS FOR: {name}")
        print("=" * 80)
        with open(path, "rb") as f:
            pdf_bytes = f.read()

        dom_builder = InMemoryDOMBuilder(pdf_bytes)
        raw_paras, total_pages, stats = dom_builder.build_dom_paragraphs()
        detector = BranhamBoundaryDetector()
        boundary = detector.detect_boundaries(raw_paras)
        start_idx = boundary.get("start_index", 0)
        end_idx = boundary.get("end_index", len(raw_paras) - 1)
        sliced = raw_paras[start_idx:end_idx+1]

        diag = verify_transcript(pdf_bytes, sliced, pdf_stats=stats)
        print(f"Status           : {diag.get('status')}")
        print(f"Passed           : {diag.get('passed')}")
        print(f"Critical Failures: {diag.get('critical_failures')}")
        print(f"Structural Issues: {diag.get('structural_issues')}")
        print(f"Cosmetic Warnings: {diag.get('cosmetic_warnings')}")
        print("\n")

if __name__ == "__main__":
    main()
