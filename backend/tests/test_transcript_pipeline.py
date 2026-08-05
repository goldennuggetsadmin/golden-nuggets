import unittest
import os
import sys

from services.transcript_service import extract_transcript_from_pdf_bytes, InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

class TestTranscriptPipelineStabilization(unittest.TestCase):
    def setUp(self):
        self.test_files = [
            {
                "path": "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf",
                "name": "53-0729 (English)",
                "expected_min_paras": 200,
                "expected_last_num": 284
            },
            {
                "path": "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf",
                "name": "57-0421S (Telugu)",
                "expected_min_paras": 80,
                "expected_last_num": 92
            }
        ]

    def test_pipeline_stability_and_no_regressions(self):
        for item in self.test_files:
            path = item["path"]
            name = item["name"]
            if not os.path.exists(path):
                print(f"Skipping {name} (file not found)")
                continue

            with open(path, "rb") as f:
                pdf_bytes = f.read()

            dom_builder = InMemoryDOMBuilder(pdf_bytes)
            raw_paragraphs, total_pages, stats = dom_builder.build_dom_paragraphs()

            self.assertGreater(total_pages, 0, f"Total pages for {name} must be > 0")
            self.assertGreater(len(raw_paragraphs), item["expected_min_paras"], f"Raw paragraphs for {name} should exceed {item['expected_min_paras']}")

            detector = BranhamBoundaryDetector()
            boundary_meta = detector.detect_boundaries(raw_paragraphs)
            
            start_idx = boundary_meta.get("start_index", 0)
            end_idx = boundary_meta.get("end_index", len(raw_paragraphs) - 1)
            sliced_paragraphs = raw_paragraphs[start_idx : end_idx + 1]

            self.assertGreater(len(sliced_paragraphs), 0, f"Sliced paragraphs for {name} must not be empty")

            # Check paragraph ordering and numbering monotonicity
            prev_num = 0
            seen_numbers = set()
            duplicate_numbers = []

            for i, p in enumerate(sliced_paragraphs):
                p_num = p.get("paragraph_number")
                if p_num is not None:
                    if p_num < prev_num:
                        self.fail(f"Paragraph number regression in {name} at index {i}: #{p_num} after #{prev_num}")
                    prev_num = p_num

            # Verify last paragraph number matches expected
            last_num = sliced_paragraphs[-1].get("paragraph_number")
            if last_num is not None:
                self.assertGreaterEqual(last_num, item["expected_last_num"] - 5, f"Last paragraph number for {name} should be near {item['expected_last_num']}")

            # Run Verifier
            diagnostics = verify_transcript(pdf_bytes, sliced_paragraphs, pdf_stats=stats)
            structural_issues = diagnostics.get("structural_issues", [])
            self.assertEqual(len(structural_issues), 0, f"Zero structural issues required for {name}. Got: {structural_issues}")

            print(f"✅ {name} PASSED pipeline stabilization regression tests! (Total Sliced Paras: {len(sliced_paragraphs)}, Last Num: {last_num})")

if __name__ == "__main__":
    unittest.main()
