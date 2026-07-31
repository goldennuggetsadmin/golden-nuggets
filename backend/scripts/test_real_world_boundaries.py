import asyncio
import logging
from services.transcript_service import extract_transcript_from_pdf_bytes
import httpx

logging.basicConfig(level=logging.ERROR)

async def run():
    print("================================================================================")
    print("GOLDEN NUGGETS IMPORT ENGINE v1 - CANONICAL BOUNDARY VALIDATION REPORT")
    print("================================================================================")
    
    test_sermons = [
        {"code": "57-0825E", "lang": "Telugu", "title": "హెబ్రీ పత్రిక, రెండవ అధ్యాయము (Hebrews, Chapter Two)", "url": "https://tucson.branham.org/pdf/TEL/57-0825E%20Hebrews%20Chapter%202%20Part%201%20VGR.pdf"},
        {"code": "59-0329S", "lang": "Telugu", "title": "ఇంత గొప్ప రక్షణ (So Great Salvation)", "url": "https://tucson.branham.org/pdf/TEL/59-0329S%20So%20Great%20Salvation%20VGR.pdf"},
        {"code": "53-0729", "lang": "English", "title": "Questions And Answers On Genesis", "url": "https://tucson.branham.org/pdf/ENG/53-0729%20Questions%20And%20Answers%20On%20Genesis%20VGR.pdf"},
        {"code": "47-0412", "lang": "English", "title": "Faith Is The Substance", "url": "https://tucson.branham.org/pdf/ENG/47-0412%20Faith%20Is%20The%20Substance%20VGR.pdf"},
        {"code": "47-1123", "lang": "English", "title": "The Children Of Israel", "url": "https://tucson.branham.org/pdf/ENG/47-1123%20The%20Children%20Of%20Israel%20VGR.pdf"},
    ]
    
    async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
        for doc in test_sermons:
            pdf_url = doc["url"]
            try:
                resp = await client.get(pdf_url)
                if resp.status_code >= 400:
                    print(f"Failed to fetch {doc['code']}")
                    continue
            except Exception as e:
                print(f"Network error fetching {doc['code']}")
                continue
                
            res = extract_transcript_from_pdf_bytes(resp.content)
            
            boundary = res.get("import_report", {}).get("boundary_detection", {})
            canonical = res.get("transcripts", [])
            
            print(f"\nSermon: {doc['code']} ({doc['lang']}) - {doc['title']}")
            print(f"Boundary Confidence: {boundary.get('confidence')}")
            print("Detected Start:")
            print(f"Page {boundary.get('canonical_start_page')}")
            
            first_pnum = canonical[0].get('paragraph_number') if canonical else None
            print(f"Paragraph {first_pnum if first_pnum is not None else 'None (Title Page)'}")
            
            print("Detected End:")
            print(f"Page {boundary.get('canonical_end_page')}")
            last_pnum = canonical[-1].get('paragraph_number') if canonical else None
            print(f"Paragraph {last_pnum if last_pnum is not None else 'None (Unknown)'}")
            
            print("\nFirst Visible Lines:")
            for p in canonical[:3]:
                text = p.get('text', '')
                lines = text.split('\n')
                print(lines[0])
                if len(lines) > 1:
                    print(lines[1])
                print("↓")
                
            print("\nLast Visible Lines:")
            if canonical:
                print(canonical[-1].get('text', '').replace('\n', ' '))
                
            print(f"\nPublisher Matter Removed: {'YES' if boundary.get('front_matter_removed') else 'NO'}")
            print(f"Manual Override: {'YES' if boundary.get('manual_override') else 'NO'}")
            print("-" * 80)

if __name__ == "__main__":
    asyncio.run(run())
