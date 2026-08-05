"""
Diagnose Page 20 & 22 of 57-0421S
"""
import pdfplumber
import io

PDF_PATH = "/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/backend/test_data/57-0421S_The_Great_And_Mighty_Conqueror.pdf"

with pdfplumber.open(PDF_PATH) as pdf:
    for pg in [20, 21, 22]:
        if pg <= len(pdf.pages):
            page = pdf.pages[pg - 1]
            words = page.extract_words()
            print(f"Page {pg}: Height={page.height:.1f}, Width={page.width:.1f}, Raw words={len(words)}")
            tops = [round(w['top'], 1) for w in words]
            print(f"  Min top: {min(tops) if tops else 'N/A'}, Max top: {max(tops) if tops else 'N/A'}")
            print(f"  First 5 words: {[w['text'] for w in words[:5]]}")
            print(f"  Last 5 words: {[w['text'] for w in words[-5:]]}")
            print("-" * 60)
