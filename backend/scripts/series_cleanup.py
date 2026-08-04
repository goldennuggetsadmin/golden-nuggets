"""
Series Cleanup Script — Golden Nuggets
======================================
Audits the sermons table for invalid series values (sermon codes used as series),
reassigns those sermons to 'General', and produces a full report.

Run: PYTHONPATH=. python3 scripts/series_cleanup.py
"""
import asyncio
import re
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from db import _init_pool, get_pool

VALID_SERIES = {
    "General",
    "My Life Story",
    "How the Angel Came to Me",
    "The Revelation of the Seven Seals",
    "The Revelation of Jesus Christ",
    "Conduct, Order, and Doctrine of the Church",
    "The Book of Hebrews",
    "The Holy Ghost",
    "Adoption",
    "The Seventy Weeks of Daniel",
    "The Church",
    "Demonology",
    "Israel and the Church",
    "The Church Age Book (audio)",
}

# Pattern: sermon code like 47-0412, 50-0820A, 48-0000
SERMON_CODE_RE = re.compile(r"^\d{2}-\d{4}[A-Za-z]?$")


def is_invalid_series(name: str) -> bool:
    """Return True if this series value is actually a sermon code or empty."""
    if not name or not name.strip():
        return True
    if SERMON_CODE_RE.match(name.strip()):
        return True
    return False


async def run():
    await _init_pool()
    pool = get_pool()

    if not pool:
        print("ERROR: Could not connect to database pool.")
        sys.exit(1)

    async with pool.acquire() as conn:
        # ── Step 1: Audit — find all distinct series values ──────────────────
        rows = await conn.fetch(
            "SELECT DISTINCT series FROM sermons WHERE series IS NOT NULL AND series != ''"
        )
        all_series = [r["series"] for r in rows]

        invalid_series = [s for s in all_series if is_invalid_series(s)]
        valid_remaining = [s for s in all_series if not is_invalid_series(s)]

        # Also flag any series not in the predefined set (but not a code)
        unexpected = [s for s in valid_remaining if s not in VALID_SERIES]

        print("=" * 70)
        print("SERIES AUDIT REPORT")
        print("=" * 70)
        print(f"\nTotal distinct series found in DB: {len(all_series)}")
        print(f"  ✅ Valid predefined series:       {len([s for s in valid_remaining if s in VALID_SERIES])}")
        print(f"  ⚠️  Unknown (not code, not valid): {len(unexpected)}")
        print(f"  ❌ Invalid (sermon codes):         {len(invalid_series)}")

        if unexpected:
            print("\n⚠️  UNEXPECTED SERIES (not in predefined list, will be reassigned to General):")
            for s in sorted(unexpected):
                cnt = await conn.fetchval(
                    "SELECT COUNT(*) FROM sermons WHERE series = $1", s
                )
                print(f"   '{s}' — {cnt} sermon(s)")

        if invalid_series:
            print("\n❌ INVALID SERIES TO BE REMOVED:")
            for s in sorted(invalid_series):
                cnt = await conn.fetchval(
                    "SELECT COUNT(*) FROM sermons WHERE series = $1", s
                )
                print(f"   '{s}' — {cnt} sermon(s)")

        # ── Step 2: Reassign invalid + unexpected sermons to General ─────────
        to_clear = invalid_series + unexpected
        total_reassigned = 0

        if not to_clear:
            print("\n✅ No invalid series found. Database is clean.")
        else:
            print(f"\n🔧 Reassigning {len(to_clear)} invalid/unexpected series values to 'General'...")
            for bad_series in to_clear:
                result = await conn.execute(
                    "UPDATE sermons SET series = 'General', updated_at = NOW() WHERE series = $1",
                    bad_series
                )
                count = int(result.split()[-1])
                total_reassigned += count
                print(f"   Reassigned {count} sermon(s) from '{bad_series}' → General")


        # ── Step 3: Ensure all NULL/empty series are set to General ──────────
        null_result = await conn.execute(
            "UPDATE sermons SET series = 'General', updated_at = NOW() WHERE (series IS NULL OR series = '')"
        )
        null_count = int(null_result.split()[-1])
        if null_count:
            print(f"\n🔧 Set {null_count} sermon(s) with NULL/empty series → General")
            total_reassigned += null_count

        # ── Step 4: Final verification ────────────────────────────────────────
        final_rows = await conn.fetch(
            "SELECT DISTINCT series FROM sermons WHERE series IS NOT NULL ORDER BY series"
        )
        final_series = [r["series"] for r in final_rows]

        still_invalid = [s for s in final_series if is_invalid_series(s)]
        still_unexpected = [s for s in final_series if s not in VALID_SERIES and not is_invalid_series(s)]

        print("\n" + "=" * 70)
        print("FINAL SERIES CLEANUP REPORT")
        print("=" * 70)
        print(f"\n  Total invalid series removed:     {len(to_clear)}")
        print(f"  Total sermons reassigned:         {total_reassigned}")
        print(f"  Final distinct series count:      {len(final_series)}")

        print("\n📋 REMAINING SERIES IN DATABASE:")
        for s in final_series:
            cnt = await conn.fetchval("SELECT COUNT(*) FROM sermons WHERE series = $1", s)
            flag = "✅" if s in VALID_SERIES else "❌ STILL INVALID"
            print(f"   {flag} '{s}' — {cnt} sermon(s)")

        if still_invalid or still_unexpected:
            print(f"\n❌ WARNING: {len(still_invalid + still_unexpected)} series still need attention!")
        else:
            print("\n✅ SUCCESS: All series are now valid predefined series.")
            print("   The database is clean and production-ready.")


if __name__ == "__main__":
    asyncio.run(run())
