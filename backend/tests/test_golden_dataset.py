import os
import sys
import io
import ssl
import json
import unittest
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.transcript_service import extract_transcript_from_pdf_bytes

GOLDEN_TEST_SUITE = [
    {
        "id": "648ef839-f56d-460a-9423-9bac7e058c4e",
        "title": "57-0421S గొప్ప బలిష్ఠుడైన జయశాలి",
        "language": "te",
        "url": "https://d2w09gj4mqt5u.cloudfront.net/repo/4a0/4a07addea00aaaf752e7ce1a00a83d3714f6f7afdd451a5b67556d4ced511d09d771e9bc052939b6355eb08efae54bca40e6bfb08ddafffab2e7e574329bf085.pdf",
        "min_paragraphs": 100,
        "sample_keyword": "సూర్యుడు",
        "sample_keyword_2": "చూచుట"
    },
    {
        "id": "e90e1c48-bbf5-49eb-b035-9d87a135f6d2",
        "title": "53-0729 Questions And Answers On Genesis",
        "language": "en",
        "url": "https://d2w09gj4mqt5u.cloudfront.net/repo/344/34491a3c12c8077b8ebb20ac7d2decdbcd795de6437b75f9efee262c046ce530c305786d9b22ee9da7637b4a1149d266cfd6488c8ffaab96c5c19e33aab2227c.pdf",
        "min_paragraphs": 300,
        "sample_keyword": "Genesis",
        "sample_keyword_2": "Questions"
    }
]


def load_pdf(test_case: dict) -> bytes:
    if "local_path" in test_case and os.path.exists(test_case["local_path"]):
        with open(test_case["local_path"], "rb") as f:
            return f.read()
    elif "url" in test_case:
        ctx = ssl._create_unverified_context()
        req = urllib.request.urlopen(test_case["url"], context=ctx)
        return req.read()
    raise ValueError("No valid source")


class TestGoldenDataset(unittest.TestCase):
    def test_golden_dataset(self):
        for tc in GOLDEN_TEST_SUITE:
            print(f"Testing Golden PDF: {tc['title']}...")
            pdf_bytes = load_pdf(tc)
            self.assertGreater(len(pdf_bytes), 0)

            extracted = extract_transcript_from_pdf_bytes(pdf_bytes)
            paragraphs = extracted.get("transcripts", [])
            self.assertGreaterEqual(len(paragraphs), tc["min_paragraphs"])

            full_text = "\n".join(p.get("text", "") for p in paragraphs)
            self.assertIn(tc["sample_keyword"], full_text)
            self.assertIn(tc["sample_keyword_2"], full_text)
            print(f"✅ PASSED: {tc['title']}")


if __name__ == "__main__":
    unittest.main()
