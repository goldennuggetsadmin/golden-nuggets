"""
Diagnose Page 22 geometry for sermon 47-1102.
We want the exact `top` values of every word on Page 22
to confirm whether the header/footer threshold (72.0) is the culprit.
"""
import asyncio
import io
import httpx
import pdfplumber

PDF_URL = "https://d2w09gj4mqt5u.cloudfront.net/repo/db7/db7f4aa539165cbf7ae9ec24772d14f8985da5c01638f918c0c3c431a798034b5ed6ed61fb37f5a5353574911cc716d5e95acbf5e8ffb22c77126d52c46cb99b.pdf"

async def main():
    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0) as client:
        resp = await client.get(PDF_URL)
        pdf_bytes = resp.content

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        total_pages = len(pdf.pages)
        print(f"Total pages: {total_pages}")

        for page_no in [21, 22, 23]:
            page = pdf.pages[page_no - 1]
            p_height = float(page.height) if page.height else 792.0
            p_width = float(page.width) if page.width else 612.0
            print(f"\n{'='*60}")
            print(f"PAGE {page_no}: height={p_height:.1f}, width={p_width:.1f}")
            print(f"{'='*60}")

            words = page.extract_words(
                x_tolerance=1.5,
                y_tolerance=3.0,
                keep_blank_chars=True,
                extra_attrs=["fontname", "size"]
            )
            print(f"  Total words extracted: {len(words)}")
            if not words:
                print("  >>> NO WORDS EXTRACTED BY pdfplumber <<<")
                # Try text extraction as fallback
                raw_text = page.extract_text()
                print(f"  extract_text() result: '{raw_text[:200] if raw_text else 'NONE'}'")
            else:
                print(f"  First 10 words with their 'top' values:")
                for w in words[:10]:
                    top_val = w.get('top', 'N/A')
                    is_hf = top_val != 'N/A' and (top_val < 72.0 or top_val > 730.0)
                    print(f"    top={top_val:.1f}, x0={w['x0']:.1f}, text='{w['text']}' {'<-- FILTERED AS HEADER/FOOTER' if is_hf else ''}")

                all_tops = sorted(set(round(w['top'], 1) for w in words))
                print(f"\n  All distinct top values: {all_tops}")
                filtered_out = [w for w in words if w['top'] < 72.0 or w['top'] > 730.0]
                print(f"  Words filtered as header/footer: {len(filtered_out)}")
                surviving = [w for w in words if 72.0 <= w['top'] <= 730.0]
                print(f"  Words that SURVIVE the 72.0-730.0 filter: {len(surviving)}")

                if surviving:
                    print(f"  Surviving word text sample: {[w['text'] for w in surviving[:10]]}")
                else:
                    print(f"  >>> ALL WORDS ON PAGE {page_no} ARE FILTERED BY HEADER/FOOTER RULE <<<")
                    print(f"  Lowest top on page: {min(w['top'] for w in words):.1f}")
                    print(f"  Highest top on page: {max(w['top'] for w in words):.1f}")
                    print(f"  With page-relative threshold (9% / 92%): min_allowed={p_height*0.09:.1f}, max_allowed={p_height*0.92:.1f}")
                    surviving_rel = [w for w in words if p_height*0.09 <= w['top'] <= p_height*0.92]
                    print(f"  Words surviving page-relative threshold: {len(surviving_rel)}")
                    if surviving_rel:
                        print(f"  Surviving text sample: {[w['text'] for w in surviving_rel[:10]]}")

if __name__ == "__main__":
    asyncio.run(main())
