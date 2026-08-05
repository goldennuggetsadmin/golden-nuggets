import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool
from routers.mobile import list_years

async def test_years():
    await _init_pool()
    years = await list_years()

    print("\n==================================================================")
    print("GET /api/v1/mobile/years ENDPOINT TEST RESULT")
    print("==================================================================")
    print(f"Total years returned: {len(years)}")
    print(f"{'YEAR':<6} | {'SERMON COUNT':<15}")
    print("-" * 30)

    total_sermons = 0
    for item in years:
        y = item["year"]
        c = item["sermonCount"]
        total_sermons += c
        print(f"{y:<6} | {c:<15}")

    print("-" * 30)
    print(f"TOTAL  | {total_sermons:<15}")
    print("==================================================================\n")

if __name__ == "__main__":
    asyncio.run(test_years())
