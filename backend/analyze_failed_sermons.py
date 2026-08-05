"""
Analyze Failure Reasons Across All 27 NEEDS_REVIEW Sermons in Database
Categorizes failures into explicit buckets:
1. Per-Page Source Consistency (Word density thresholds)
2. CID Font / Unspaced Collapsed Tokens
3. Duplicate / Regressive Paragraph Numbers
4. Reading Order & Bounding Box Inversions
5. Document Source Density Failure
"""
import asyncio
from collections import defaultdict, Counter
from dotenv import load_dotenv
load_dotenv()

import db
from repositories.entities import sermons_repo
from services.transcript_service import extract_transcript_from_pdf_bytes
from services.verifier import verify_transcript
import httpx

async def main():
    await db.connect()
    repo = sermons_repo()
    sermons = await repo.find({})
    
    print("=" * 80)
    print(f"FAILED SERMON FAILURE REASON ANALYSIS (Total Sermons: {len(sermons)})")
    print("=" * 80)

    category_counts = Counter()
    category_sermons = defaultdict(list)
    sermon_details = []

    for s in sermons:
        sermon_id = s.get("id")
        code = s.get("sermon_code", "unknown")
        title = s.get("title", "")
        parsed = s.get("transcript_parsed", False)
        paras = s.get("transcripts") or []
        
        if not paras:
            continue

        p0 = paras[0] if isinstance(paras[0], dict) else {}
        diag = p0.get("quality_diagnostics", {})
        status = diag.get("status") or ("APPROVED_AND_FROZEN" if parsed else "NEEDS_REVIEW")
        passed = diag.get("passed", parsed)
        critical = diag.get("critical_failures", [])
        structural = diag.get("structural_issues", [])

        if not passed:
            sermon_categories = set()
            for err in critical + structural:
                if "Per-Page Source Consistency Failure" in err:
                    sermon_categories.add("Per-Page Source Consistency (Word Density)")
                elif "Unusually long word" in err or "Collapsed" in err or "Unspaced" in err:
                    sermon_categories.add("CID Font / Token Collapses (Unspaced Words)")
                elif "Paragraph number regression" in err or "Duplicate paragraph" in err:
                    sermon_categories.add("Paragraph Numbering / Sequence Issue")
                elif "Reading order" in err or "Vertical reading order" in err:
                    sermon_categories.add("Reading Order / Bounding Box Inversion")
                elif "Document Source Consistency" in err:
                    sermon_categories.add("Document-Level Density Failure")
                else:
                    sermon_categories.add("Other / Unclassified")

            for cat in sermon_categories:
                category_counts[cat] += 1
                category_sermons[cat].append(code)

            sermon_details.append({
                "code": code,
                "title": title,
                "categories": list(sermon_categories),
                "errors": critical + structural
            })

    print(f"\nTotal Unverified / Failed Sermons: {len(sermon_details)}")
    print("\n--- FAILURE CATEGORY BREAKDOWN ---")
    print(f"{'Failure Category':<45} | {'Count':<5} | {'Percentage':<10}")
    print("-" * 70)
    for cat, cnt in category_counts.most_common():
        pct = round((cnt / max(len(sermon_details), 1)) * 100, 1)
        print(f"{cat:<45} | {cnt:<5d} | {pct:>5.1f}%")

    print("\n--- DETAILED FAILURE LOG BY SERMON ---")
    for d in sermon_details:
        print(f"\nSermon [{d['code']}] {d['title']}")
        print(f"  Categories: {', '.join(d['categories'])}")
        print("  Errors:")
        for err in d["errors"]:
            print(f"    - {err}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
