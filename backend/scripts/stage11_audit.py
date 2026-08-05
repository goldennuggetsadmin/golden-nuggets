import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool
from repositories.entities import sermons_repo
from routers.mobile import list_sermons as mobile_list_sermons

async def stage_11_audit():
    await _init_pool()
    repo = sermons_repo()

    # 1. Admin / DB Count per year
    all_db = await repo.find({"is_archived": {"$ne": True}})
    db_by_year = {}
    for d in all_db:
        y = str(d.get("year") or "")
        db_by_year[y] = db_by_year.get(y, 0) + 1

    # 2. Mobile API count per year (page_size=1000 - CURRENT BUGGED BEHAVIOR)
    mobile_1000 = await mobile_list_sermons(page=1, page_size=1000)
    m1000_by_year = {}
    for d in mobile_1000["items"]:
        y = str(d.get("year") or "")
        m1000_by_year[y] = m1000_by_year.get(y, 0) + 1

    # 3. Mobile API count per year (page_size=5000 - UNLIMITED FIX BEHAVIOR)
    mobile_5000 = await mobile_list_sermons(page=1, page_size=5000)
    m5000_by_year = {}
    for d in mobile_5000["items"]:
        y = str(d.get("year") or "")
        m5000_by_year[y] = m5000_by_year.get(y, 0) + 1

    years = [str(y) for y in range(1947, 1966)]
    print("\n==========================================================================================")
    print("STAGE 11 — COMPARE ADMIN vs CURRENT MOBILE (page_size=1000) vs FIXED MOBILE (page_size=5000)")
    print("==========================================================================================")
    print(f"{'YEAR':<6} | {'ADMIN / DB COUNT':<18} | {'CURRENT MOBILE (1000)':<22} | {'FIXED MOBILE (5000)':<20} | {'STATUS':<15}")
    print("-" * 90)

    for y in years:
        admin_c = db_by_year.get(y, 0)
        m1000_c = m1000_by_year.get(y, 0)
        m5000_c = m5000_by_year.get(y, 0)
        status = "MISSING IN MOBILE" if admin_c > 0 and m1000_c == 0 else ("PARTIAL" if admin_c != m1000_c else "MATCH")
        print(f"{y:<6} | {admin_c:<18} | {m1000_c:<22} | {m5000_c:<20} | {status:<15}")

    print("-" * 90)
    print(f"{'TOTAL':<6} | {len(all_db):<18} | {len(mobile_1000['items']):<22} | {len(mobile_5000['items']):<20} |")
    print("==========================================================================================\n")

if __name__ == "__main__":
    asyncio.run(stage_11_audit())
