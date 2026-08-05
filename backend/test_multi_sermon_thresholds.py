"""
Test Gap Threshold Impact Across Multiple Sermons
Compares paragraph count, missing numbers, and verifier status for different gap thresholds (12.0, 10.0, 8.0, 6.0) across all available PDFs.
"""
import io
import os
import httpx
from services.transcript_service import InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

LOCAL_PDF_FILES = [
    ("53-0729", "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf"),
    ("57-0421S", "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf"),
]

REMOTE_PDF_URLS = [
    ("47-1102", "https://d2w09gj4mqt5u.cloudfront.net/repo/db7/db7f4aa539165cbf7ae9ec24772d14f8985da5c01638f918c0c3c431a798034b5ed6ed61fb37f5a5353574911cc716d5e95acbf5e8ffb22c77126d52c46cb99b.pdf"),
]

def test_pdf_with_threshold(name, pdf_bytes, gap_thresh):
    # Temporarily monkey-patch or measure DOM builder logic
    dom_builder = InMemoryDOMBuilder(pdf_bytes)
    # We can inspect the effect of gap_thresh by running DOM builder
    raw_paras, total_pages, stats = dom_builder.build_dom_paragraphs()
    detector = BranhamBoundaryDetector()
    boundary = detector.detect_boundaries(raw_paras)
    start_idx = boundary.get("start_index", 0)
    end_idx = boundary.get("end_index", len(raw_paras) - 1)
    sliced = raw_paras[start_idx:end_idx+1]
    
    verifier_res = verify_transcript(pdf_bytes, sliced, pdf_stats=stats)
    
    nums = [p.get("paragraph_number") for p in sliced if p.get("paragraph_number") is not None]
    return {
        "raw_count": len(raw_paras),
        "sliced_count": len(sliced),
        "nums_count": len(nums),
        "first_num": nums[0] if nums else None,
        "last_num": nums[-1] if nums else None,
        "status": verifier_res.get("status"),
        "passed": verifier_res.get("passed"),
        "critical_failures": verifier_res.get("critical_failures"),
    }

def main():
    print("=" * 80)
    print("TESTING DOM EXTRACTION WITH CURRENT PIPELINE ACROSS SERMONS")
    print("=" * 80)

    for name, path in LOCAL_PDF_FILES:
        if os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
            res = test_pdf_with_threshold(name, data, 8.0)
            print(f"Sermon: {name:10s} | Raw: {res['raw_count']:3d} | Sliced: {res['sliced_count']:3d} | Numbered: {res['nums_count']:3d} (First #{res['first_num']}, Last #{res['last_num']}) | Verifier: {res['status']} (Passed={res['passed']})")

    import httpx
    with httpx.Client(verify=False, follow_redirects=True, timeout=60.0) as client:
        for name, url in REMOTE_PDF_URLS:
            resp = client.get(url)
            if resp.status_code == 200:
                res = test_pdf_with_threshold(name, resp.content, 8.0)
                print(f"Sermon: {name:10s} | Raw: {res['raw_count']:3d} | Sliced: {res['sliced_count']:3d} | Numbered: {res['nums_count']:3d} (First #{res['first_num']}, Last #{res['last_num']}) | Verifier: {res['status']} (Passed={res['passed']})")

if __name__ == "__main__":
    main()
