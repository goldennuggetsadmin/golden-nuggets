"""
Multi-Sermon Line Gap Histogram & Spacing Analysis
Measures line-to-line vertical spacing across multiple PDFs to empirically determine:
1. Intra-paragraph line gap distribution (line spacing within same paragraph)
2. Inter-paragraph line gap distribution (spacing between separate paragraphs)
3. Optimal adaptive threshold separating intra-paragraph gaps vs inter-paragraph gaps.
"""
import asyncio
import io
import os
import glob
import httpx
import pdfplumber
from collections import Counter

# Test PDF targets
LOCAL_PDF_FILES = [
    "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/53-0729_Questions_And_Answers_On_Genesis.pdf",
    "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf",
    "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/debug_garbled.pdf",
]

REMOTE_PDF_URLS = [
    ("47-1102", "https://d2w09gj4mqt5u.cloudfront.net/repo/db7/db7f4aa539165cbf7ae9ec24772d14f8985da5c01638f918c0c3c431a798034b5ed6ed61fb37f5a5353574911cc716d5e95acbf5e8ffb22c77126d52c46cb99b.pdf"),
    ("57-0421S (CloudFront)", "https://d2w09gj4mqt5u.cloudfront.net/repo/344/34491a3c12c8077b8ebb20ac7d2decdbcd795de6437b75f9efee262c046ce530c305786d9b22ee9da7637b4a1149d266cfd6488c8ffaab96c5c19e33aab2227c.pdf"),
    ("53-0729 (CloudFront)", "https://d2w09gj4mqt5u.cloudfront.net/repo/4a0/4a07addea00aaaf752e7ce1a00a83d3714f6f7afdd451a5b67556d4ced511d09d771e9bc052939b6355eb08efae54bca40e6bfb08ddafffab2e7e574329bf085.pdf"),
]

def analyze_pdf_gaps(name, pdf_bytes):
    print("=" * 80)
    print(f"ANALYZING PDF: {name}")
    print("=" * 80)
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        all_gaps = []
        numbered_line_gaps = []
        regular_line_gaps = []

        for page_no, page in enumerate(pdf.pages, 1):
            p_height = float(page.height) if page.height else 792.0
            words = page.extract_words(x_tolerance=1.5, y_tolerance=3.0, keep_blank_chars=True)
            if not words:
                continue

            # Group words into lines
            from collections import defaultdict
            y_groups = defaultdict(list)
            for w in words:
                y_key = round(w["top"], 1)
                y_groups[y_key].append(w)

            sorted_y_keys = sorted(y_groups.keys())
            merged_lines = []
            for yk in sorted_y_keys:
                w_list = y_groups[yk]
                if not merged_lines:
                    merged_lines.append((yk, w_list))
                else:
                    prev_yk, prev_list = merged_lines[-1]
                    if abs(yk - prev_yk) <= 3.0:
                        prev_list.extend(w_list)
                    else:
                        merged_lines.append((yk, w_list))

            # Filter out top/bottom headers/footers
            body_lines = []
            for yk, w_list in merged_lines:
                if yk >= p_height * 0.09 and yk <= p_height * 0.92:
                    min_top = min(w["top"] for w in w_list)
                    max_bottom = max(w["bottom"] for w in w_list)
                    line_str = " ".join(w["text"] for w in w_list).strip()
                    if line_str:
                        body_lines.append({
                            "text": line_str,
                            "top": min_top,
                            "bottom": max_bottom
                        })

            for i in range(1, len(body_lines)):
                prev = body_lines[i-1]
                curr = body_lines[i]
                gap = round(curr["top"] - prev["bottom"], 1)
                all_gaps.append(gap)
                
                # Check if current line starts with paragraph number e.g. "5 ", "[5]"
                import re
                if re.match(r"^(?:E-)?\[?(\d{1,4})\]?[\.\s\-]", curr["text"]):
                    numbered_line_gaps.append(gap)
                else:
                    regular_line_gaps.append(gap)

        print(f"Total line transitions analyzed: {len(all_gaps)}")
        print(f"  Numbered line gaps (definite paragraph starts): {len(numbered_line_gaps)}")
        if numbered_line_gaps:
            num_counts = Counter(numbered_line_gaps)
            print("  Histogram of gaps BEFORE NUMBERED PARAGRAPH STARTS:")
            for g in sorted(num_counts.keys()):
                print(f"    Gap = {g:5.1f} pt : {num_counts[g]:3d} occurrences")
            min_num_gap = min(numbered_line_gaps)
            max_num_gap = max(numbered_line_gaps)
            avg_num_gap = sum(numbered_line_gaps) / len(numbered_line_gaps)
            print(f"  --> Numbered Para Gap Range: Min={min_num_gap:.1f}pt, Max={max_num_gap:.1f}pt, Avg={avg_num_gap:.1f}pt")

        print(f"\n  Regular line gaps (within body / unnumbered): {len(regular_line_gaps)}")
        if regular_line_gaps:
            reg_counts = Counter(regular_line_gaps)
            print("  Top 10 most common regular line gaps:")
            for g, c in reg_counts.most_common(10):
                print(f"    Gap = {g:5.1f} pt : {c:3d} occurrences")

        print("\n")

async def main():
    for filepath in LOCAL_PDF_FILES:
        if os.path.exists(filepath):
            with open(filepath, "rb") as f:
                pdf_bytes = f.read()
            analyze_pdf_gaps(os.path.basename(filepath), pdf_bytes)

    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=60.0) as client:
        for name, url in REMOTE_PDF_URLS:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    analyze_pdf_gaps(name, resp.content)
            except Exception as e:
                print(f"Failed to fetch {name}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
