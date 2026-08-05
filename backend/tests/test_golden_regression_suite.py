"""
Golden Regression Suite
CI Guardrail: Automates pipeline verification across a diverse multi-era sample of sermons.
Fails build if any unexpected regression occurs in boundary detection, line ordering,
paragraph numbers, or verifier status.
"""
import unittest
import io
import os
import httpx

from services.transcript_service import InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

BENCHMARK_SERMONS = [
    {
        "code": "47-1102",
        "title": "The Angel Of God",
        "local_path": None,
        "url": "https://d2w09gj4mqt5u.cloudfront.net/repo/db7/db7f4aa539165cbf7ae9ec24772d14f8985da5c01638f918c0c3c431a798034b5ed6ed61fb37f5a5353574911cc716d5e95acbf5e8ffb22c77126d52c46cb99b.pdf",
        "min_paras": 50,
        "max_paras": 60,
        "expected_last_num": 51,
        "expect_passed": True
    },
    {
        "code": "53-0729",
        "title": "Questions And Answers On Genesis",
        "local_path": "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf",
        "url": None,
        "min_paras": 270,
        "max_paras": 300,
        "expected_last_num": 284,
        "expect_passed": True
    }
]

class TestGoldenRegressionSuite(unittest.TestCase):

    def test_golden_dataset_pipeline(self):
        for b in BENCHMARK_SERMONS:
            with self.subTest(sermon=b["code"]):
                print(f"\n[CI REGRESSION] Testing Sermon: {b['code']} — {b['title']}...")
                pdf_bytes = None
                if b["local_path"] and os.path.exists(b["local_path"]):
                    with open(b["local_path"], "rb") as f:
                        pdf_bytes = f.read()
                elif b["url"]:
                    resp = httpx.get(b["url"], verify=False, follow_redirects=True, timeout=60.0)
                    self.assertEqual(resp.status_code, 200, f"Failed to download PDF for {b['code']}")
                    pdf_bytes = resp.content

                self.assertIsNotNone(pdf_bytes, f"No PDF bytes available for {b['code']}")

                dom_builder = InMemoryDOMBuilder(pdf_bytes)
                raw_paras, total_pages, stats = dom_builder.build_dom_paragraphs()
                detector = BranhamBoundaryDetector()
                boundary = detector.detect_boundaries(raw_paras)
                
                start_idx = boundary.get("start_index", 0)
                end_idx = boundary.get("end_index", len(raw_paras) - 1)
                sliced = raw_paras[start_idx : end_idx + 1]

                diag = verify_transcript(pdf_bytes, sliced, pdf_stats=stats)

                # Paragraph Count Assertions
                self.assertGreaterEqual(len(sliced), b["min_paras"], f"Paragraph count below threshold for {b['code']}")
                self.assertLessEqual(len(sliced), b["max_paras"], f"Paragraph count above threshold for {b['code']}")

                # Number Monotonicity Check
                nums = [p.get("paragraph_number") for p in sliced if p.get("paragraph_number") is not None]
                self.assertTrue(len(nums) > 0, f"No paragraph numbers extracted for {b['code']}")
                self.assertEqual(nums[-1], b["expected_last_num"], f"Last paragraph number mismatch for {b['code']}")
                
                for i in range(1, len(nums)):
                    self.assertGreater(nums[i], nums[i-1], f"Paragraph sequence regression for {b['code']} at #{nums[i]}")

                # Verifier Status Assertion
                if b["expect_passed"]:
                    self.assertTrue(diag.get("passed"), f"Verifier failed for {b['code']}: {diag.get('critical_failures')}")

if __name__ == "__main__":
    unittest.main()
