import asyncio
import httpx
import logging

from services.transcript_service import extract_transcript_from_pdf_bytes, InMemoryDOMBuilder
from services.boundary_detector import BranhamBoundaryDetector
from services.verifier import verify_transcript

logging.basicConfig(level=logging.INFO)

user_uploaded_sermons = [
    {
        "code": "47-1102",
        "title": "The Angel Of God",
        "url": "https://d2w09gj4mqt5u.cloudfront.net/repo/db7/db7f4aa539165cbf7ae9ec24772d14f8985da5c01638f918c0c3c431a798034b5ed6ed61fb37f5a5353574911cc716d5e95acbf5e8ffb22c77126d52c46cb99b.pdf"
    },
    {
        "code": "47-1123",
        "title": "The Children Of Israel",
        "url": "https://tucson.branham.org/pdf/ENG/47-1123%20The%20Children%20Of%20Israel%20VGR.pdf"
    },
    {
        "code": "47-1207",
        "title": "Experiences",
        "url": "https://tucson.branham.org/pdf/ENG/47-1207%20Experiences%20VGR.pdf"
    },
    {
        "code": "47-0412",
        "title": "Faith Is The Substance",
        "url": "https://tucson.branham.org/pdf/ENG/47-0412%20Faith%20Is%20The%20Substance%20VGR.pdf"
    }
]

async def trace_user_sermon(doc):
    print("=" * 80)
    print(f"TRACING YOUR UPLOADED SERMON: {doc['code']} - {doc['title']}")
    print(f"URL: {doc['url']}")
    print("=" * 80)

    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0) as client:
        try:
            resp = await client.get(doc['url'])
            if resp.status_code >= 400:
                print(f"HTTP ERROR {resp.status_code}")
                return
            pdf_bytes = resp.content
        except Exception as e:
            print(f"FETCH ERROR: {e}")
            return

    # DOM Builder
    dom_builder = InMemoryDOMBuilder(pdf_bytes)
    raw_paragraphs, total_pages, stats = dom_builder.build_dom_paragraphs()

    print(f"Total Pages: {total_pages}")
    print(f"Total Raw Extracted Paragraphs: {len(raw_paragraphs)}")

    # Boundary Detector
    detector = BranhamBoundaryDetector()
    boundary_meta = detector.detect_boundaries(raw_paragraphs)
    
    start_idx = boundary_meta.get("start_index", 0)
    end_idx = boundary_meta.get("end_index", len(raw_paragraphs) - 1)
    sliced_paragraphs = raw_paragraphs[start_idx : end_idx + 1] if raw_paragraphs else []

    print(f"Boundary Result: start_index={start_idx}, end_index={end_idx}, confidence={boundary_meta.get('confidence')}")
    print(f"Sliced Paragraph Count: {len(sliced_paragraphs)}")
    
    if sliced_paragraphs:
        print(f"FIRST PARAGRAPH (Page {sliced_paragraphs[0].get('page')}, Para #{sliced_paragraphs[0].get('paragraph_number')}):\n  '{sliced_paragraphs[0].get('text')[:120]}...'")
        print(f"LAST PARAGRAPH  (Page {sliced_paragraphs[-1].get('page')}, Para #{sliced_paragraphs[-1].get('paragraph_number')}):\n  '{sliced_paragraphs[-1].get('text')[:120]}...'")

    # Verifier
    diagnostics = verify_transcript(pdf_bytes, sliced_paragraphs, pdf_stats=stats)
    print(f"Verifier Status: {diagnostics.get('status')}, Passed: {diagnostics.get('passed')}")
    print(f"Critical Failures: {diagnostics.get('critical_failures')}")
    print(f"Structural Issues: {diagnostics.get('structural_issues')}")
    print(f"Cosmetic Warnings: {diagnostics.get('cosmetic_warnings')}")
    print("\n")

async def main():
    for doc in user_uploaded_sermons:
        await trace_user_sermon(doc)

if __name__ == "__main__":
    asyncio.run(main())
