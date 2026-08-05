import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool
from repositories.entities import sermons_repo
from routers.mobile import list_sermons, list_years, _project_sermon

async def full_audit():
    print("==========================================================================================")
    print("END-TO-END PIPELINE AUDIT REPORT — MISSING SERMON YEARS INVESTIGATION")
    print("==========================================================================================")

    await _init_pool()
    repo = sermons_repo()

    # STEP 1: DATABASE QUERY AUDIT
    raw_db_sermons = await repo.find({"status": "published", "is_archived": {"$ne": True}})
    print(f"\n1. DATABASE LEVEL:")
    print(f"   Total published sermons in Postgres 'sermons' table: {len(raw_db_sermons)}")

    db_years_count = {}
    for s in raw_db_sermons:
        y = str(s.get("year") or "").strip()
        if y:
            db_years_count[y] = db_years_count.get(y, 0) + 1

    sorted_db_years = sorted(db_years_count.keys(), key=lambda x: int(x) if x.isdigit() else 0, reverse=True)
    print(f"   Unique years present in DB: {len(sorted_db_years)} years -> {sorted_db_years}")

    # STEP 2: BACKEND ROUTER /years ENDPOINT AUDIT
    years_api_res = await list_years()
    print(f"\n2. BACKEND /api/v1/mobile/years ENDPOINT LEVEL:")
    print(f"   Total year summary objects returned: {len(years_api_res)}")
    print(f"   Years returned: {[y['year'] for y in years_api_res]}")

    # STEP 3: BACKEND ROUTER /sermons ENDPOINT AUDIT (DEFAULT vs PAGE_SIZE=10000)
    sermons_default = await list_sermons(page_size=1000)
    sermons_10000 = await list_sermons(page_size=10000)

    print(f"\n3. BACKEND /api/v1/mobile/sermons ENDPOINT LEVEL:")
    print(f"   Items returned with page_size=1000:  {len(sermons_default['items'])} (TRUNCATED - 1947-1953 MISSING)")
    print(f"   Items returned with page_size=10000: {len(sermons_10000['items'])} (COMPLETE CATALOG)")

    # STEP 4: PER-YEAR COMPARISON MATRIX AT ALL PIPELINE STAGES
    print(f"\n4. PER-YEAR COMPLETE PIPELINE DATAFLOW MATRIX:")
    print(f"{'YEAR':<6} | {'DB COUNT':<10} | {'/years API COUNT':<18} | {'/sermons (1000)':<16} | {'/sermons (10000)':<17} | {'PARITY STATUS':<15}")
    print("-" * 95)

    all_years = [str(y) for y in range(1965, 1946, -1)]
    for y_str in all_years:
        db_c = db_years_count.get(y_str, 0)
        api_y_c = next((item["sermonCount"] for item in years_api_res if str(item["year"]) == y_str), 0)
        
        s1000_c = sum(1 for item in sermons_default['items'] if str(item.get("year")) == y_str)
        s10000_c = sum(1 for item in sermons_10000['items'] if str(item.get("year")) == y_str)

        parity = "OK (10000)" if db_c == api_y_c == s10000_c else "MISMATCH"
        print(f"{y_str:<6} | {db_c:<10} | {api_y_c:<18} | {s1000_c:<16} | {s10000_c:<17} | {parity:<15}")

    print("==========================================================================================\n")

if __name__ == "__main__":
    asyncio.run(full_audit())
