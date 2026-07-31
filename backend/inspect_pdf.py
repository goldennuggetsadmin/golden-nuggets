import sys
import logging
import httpx
from services.transcript_service import extract_transcript_from_pdf_bytes

logging.basicConfig(level=logging.INFO)

def run():
    # 47-0412 Telugu
    pdf_url = "https://tucson.branham.org/pdf/TEL/47-0412%20Faith%20Is%20The%20Substance%20VGR.pdf"
    
    resp = httpx.get(pdf_url, verify=False)
    
    res = extract_transcript_from_pdf_bytes(resp.content)
    paragraphs = res.get("transcripts", [])
    
    print(f"Total Paragraphs: {len(paragraphs)}")
    
    for i, p in enumerate(paragraphs[:20]):
        print(f"[{i}] Page: {p.get('page')}, ParaNum: {p.get('paragraph_number')}")
        print(p.get("text"))
        print("-" * 40)
        
    print("=" * 80)
    for i, p in enumerate(paragraphs[-10:]):
        print(f"[{len(paragraphs)-10+i}] Page: {p.get('page')}, ParaNum: {p.get('paragraph_number')}")
        print(p.get("text"))
        print("-" * 40)

if __name__ == "__main__":
    run()
