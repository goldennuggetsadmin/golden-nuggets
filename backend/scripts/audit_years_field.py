import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool
from repositories.entities import sermons_repo

async def audit_years():
    await _init_pool()
    all_sermons = await sermons_repo().find({})
    
    missing_year_count = 0
    invalid_year_count = 0
    years_map = {}

    for s in all_sermons:
        yr = s.get("year")
        if not yr:
            missing_year_count += 1
            # see if code or date has it
            code = s.get("sermon_code")
            dt = s.get("date")
            print(f"Missing year doc: id={s.get('id')}, code={code}, date={dt}, title={s.get('title')}")
        else:
            try:
                yr_num = int(str(yr).strip())
                years_map[yr_num] = years_map.get(yr_num, 0) + 1
            except ValueError:
                invalid_year_count += 1
                print(f"Invalid year val: {yr} in doc id={s.get('id')}")

    print("\n--- YEAR FIELD AUDIT ---")
    print(f"Total sermons in DB: {len(all_sermons)}")
    print(f"Missing year field count: {missing_year_count}")
    print(f"Invalid year val count: {invalid_year_count}")
    print("\nExtracted Years Distribution:")
    for y in sorted(years_map.keys()):
        print(f"  Year {y}: {years_map[y]} sermons")

if __name__ == "__main__":
    asyncio.run(audit_years())
