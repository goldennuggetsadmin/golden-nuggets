import asyncio
import json
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool, get_pool
from repositories.entities import sermons_repo
from routers.mobile import list_sermons as mobile_list_sermons
from routers.sermons import list_sermons as admin_list_sermons

async def run_investigation():
    print("==================================================================")
    print("P0 CRITICAL INVESTIGATION REPORT — MISSING SERMONS (1947-1953)")
    print("==================================================================")

    await _init_pool()
    repo = sermons_repo()

    # -------------------------------------------------------------------------
    # STAGE 1 — DATABASE AUDIT
    # -------------------------------------------------------------------------
    print("\n--- STAGE 1: DATABASE AUDIT ---")
    all_docs = await repo.find({})
    total_db_count = len(all_docs)
    print(f"Total sermons in DB: {total_db_count}")

    published_count = sum(1 for d in all_docs if d.get("status") == "published")
    draft_count = sum(1 for d in all_docs if d.get("status") == "draft")
    archived_count = sum(1 for d in all_docs if d.get("is_archived") is True)
    
    english_count = sum(1 for d in all_docs if str(d.get("language")).lower() in ["en", "english"])
    telugu_count = sum(1 for d in all_docs if str(d.get("language")).lower() in ["te", "telugu"])

    print(f"Published in DB: {published_count}")
    print(f"Draft in DB: {draft_count}")
    print(f"Archived in DB: {archived_count}")
    print(f"English in DB: {english_count}")
    print(f"Telugu in DB: {telugu_count}")

    years = [str(y) for y in range(1947, 1966)]
    per_year_db = {}
    per_year_pub = {}
    per_year_draft = {}
    per_year_archived = {}

    for y in years:
        per_year_db[y] = 0
        per_year_pub[y] = 0
        per_year_draft[y] = 0
        per_year_archived[y] = 0

    for d in all_docs:
        yr = str(d.get("year") or "")
        if not yr and d.get("date"):
            # try extract year from date
            yr = str(d.get("date"))[:4]
        if not yr and d.get("sermon_code"):
            code = str(d.get("sermon_code"))
            if len(code) >= 2 and code[:2].isdigit():
                yy = int(code[:2])
                yr = f"19{yy}" if yy >= 47 else f"20{yy}"

        if yr in per_year_db:
            per_year_db[yr] += 1
            if d.get("status") == "published":
                per_year_pub[yr] += 1
            if d.get("status") == "draft":
                per_year_draft[yr] += 1
            if d.get("is_archived") is True:
                per_year_archived[yr] += 1

    print("\nPER-YEAR DATABASE BREAKDOWN:")
    print(f"{'YEAR':<6} | {'TOTAL DB':<10} | {'PUBLISHED':<10} | {'DRAFT':<8} | {'ARCHIVED':<8}")
    print("-" * 55)
    for y in years:
        print(f"{y:<6} | {per_year_db[y]:<10} | {per_year_pub[y]:<10} | {per_year_draft[y]:<8} | {per_year_archived[y]:<8}")

    # Inspect 1947-1953 sample sermons in detail
    print("\nSAMPLE SERMONS (1947-1953) IN DB:")
    for d in all_docs:
        yr = str(d.get("year") or "")
        code = str(d.get("sermon_code") or "")
        if yr in ["1947", "1948", "1949", "1950", "1951", "1952", "1953"] or any(code.startswith(f"{yy:02d}-") for yy in range(47, 54)):
            print(f"  ID: {d.get('id')} | Code: {d.get('sermon_code')} | Title: {d.get('title')} | Year: {d.get('year')} | Status: {d.get('status')} | Language: {d.get('language')} | CreatedAt: {d.get('created_at')}")

    # -------------------------------------------------------------------------
    # STAGE 2 — ADMIN PANEL AUDIT
    # -------------------------------------------------------------------------
    print("\n--- STAGE 2: ADMIN PANEL AUDIT ---")
    admin_published_filter = {"is_archived": {"$ne": True}}
    admin_docs = await repo.find(admin_published_filter)
    print(f"Admin repository find count (non-archived): {len(admin_docs)}")

    print("Admin search test for '47-', '48-', '49-', '50-', '51-', '52-', '53-':")
    for yy in range(47, 54):
        prefix = f"{yy:02d}-"
        matches = [d for d in admin_docs if prefix in str(d.get("sermon_code") or "") or prefix in str(d.get("title") or "")]
        print(f"  Search '{prefix}': found {len(matches)} sermons in admin repo")

    # -------------------------------------------------------------------------
    # STAGE 3 & 4 — MOBILE API AUDIT & PAGINATION
    # -------------------------------------------------------------------------
    print("\n--- STAGE 3 & 4: MOBILE API AUDIT & PAGINATION ---")
    
    # Test mobile_list_sermons with default parameters
    mobile_default = await mobile_list_sermons(page=1, page_size=1000)
    print(f"GET /mobile/sermons (default page=1, page_size=1000):")
    print(f"  Returned items count: {len(mobile_default['items'])}")
    print(f"  Total count reported: {mobile_default['total']}")

    mobile_items = mobile_default['items']
    per_year_mobile = {y: 0 for y in years}
    for item in mobile_items:
        yr = str(item.get("year") or "")
        if yr in per_year_mobile:
            per_year_mobile[yr] += 1

    print("\nPER-YEAR MOBILE API RESPONSE BREAKDOWN (page_size=1000):")
    print(f"{'YEAR':<6} | {'MOBILE API COUNT':<18}")
    print("-" * 30)
    for y in years:
        print(f"{y:<6} | {per_year_mobile[y]:<18}")

    # Test mobile_list_sermons with different page sizes and pagination
    print("\nPAGINATION TEST (page_size variations):")
    for ps in [10, 50, 100, 200, 500, 1000, 5000]:
        res = await mobile_list_sermons(page=1, page_size=ps)
        items_res = res['items']
        years_in_res = set(str(i.get("year")) for i in items_res if i.get("year"))
        min_yr = min(years_in_res) if years_in_res else "N/A"
        max_yr = max(years_in_res) if years_in_res else "N/A"
        print(f"  page_size={ps:<4} -> items returned: {len(items_res):<4} | total: {res['total']} | years present: {min_yr} to {max_yr}")

    # Check sorting effect on pagination
    print("\nSORTING ORDER IMPACT AUDIT:")
    for sort_col in ["created_at", "year", "date", "sermon_code"]:
        for ord_dir in ["desc", "asc"]:
            res = await mobile_list_sermons(sort=sort_col, order=ord_dir, page=1, page_size=100)
            years_in_p1 = set(str(i.get("year")) for i in res['items'] if i.get("year"))
            min_yr = min(years_in_p1) if years_in_p1 else "N/A"
            max_yr = max(years_in_p1) if years_in_p1 else "N/A"
            print(f"  sort={sort_col:<12} order={ord_dir:<4} page_size=100 -> Page 1 contains years: {min_yr} to {max_yr}")

    # -------------------------------------------------------------------------
    # STAGE 5 — BACKEND FILTERING AUDIT
    # -------------------------------------------------------------------------
    print("\n--- STAGE 5: BACKEND FILTERING AUDIT ---")
    filt_mobile = {"status": "published", "is_archived": {"$ne": True}}
    raw_mobile_db = await repo.find(filt_mobile, sort=[("created_at", -1)])
    print(f"DB count with mobile filter {{'status': 'published', 'is_archived': {{'$ne': True}}}}: {len(raw_mobile_db)}")
    
    # Audit languages in published sermons
    langs = {}
    for d in raw_mobile_db:
        l = str(d.get("language"))
        langs[l] = langs.get(l, 0) + 1
    print(f"Language breakdown in published sermons: {langs}")

    # Check language filter variations
    res_en = await mobile_list_sermons(language="en", page_size=1000)
    res_english = await mobile_list_sermons(language="English", page_size=1000)
    res_te = await mobile_list_sermons(language="te", page_size=1000)
    res_telugu = await mobile_list_sermons(language="Telugu", page_size=1000)

    print(f"Mobile API language='en' count: {len(res_en['items'])}")
    print(f"Mobile API language='English' count: {len(res_english['items'])}")
    print(f"Mobile API language='te' count: {len(res_te['items'])}")
    print(f"Mobile API language='Telugu' count: {len(res_telugu['items'])}")

    print("\n==================================================================")
    print("INVESTIGATION SCRIPT COMPLETED")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(run_investigation())
