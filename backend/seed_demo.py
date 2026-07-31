"""
Idempotent demo seed. Creates 10 sample testimonies matching the approved UI's
messages and attaches artwork + a sample MP3 URL for each so the mobile app
has content out-of-the-box. Idempotent by title+speaker+year.

Run: python -m seed_demo  (from /app/backend)
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from repositories import CategoryRepository, TestimonyRepository
from schemas import Testimony
from services import CategoryService
from storage_provider import build_storage


ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# Public-domain audio (SoundHelix, no auth) — used only as sample; the client
# will replace via /api/testimonies/{id}/audio later.
SAMPLE_AUDIO = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"

ARTWORK_DIR = ROOT / "storage" / "artwork"


SEEDS = [
    ("Finding Peace in Turmoil", "Dr. Sarah Jenkins", "Healing", 2024, "English", 45 * 60,
     "Peace I leave with you; my peace I give you. — John 14:27",
     "art-candle-bible.jpg", 0.32, True, True),
    ("The Power of Patience", "Rev. Michael Oh", "Faith", 2024, "English", 28 * 60,
     None, "art-wheat.jpg", 0.0, True, False),
    ("Walking by Faith", "Evangelist Clara Dias", "Faith", 2023, "English", 52 * 60,
     None, "art-mountains.jpg", 0.0, False, True),
    ("Grace Upon Grace", "Pastor David Chen", "Salvation", 2024, "English", 41 * 60,
     None, "art-coastline.jpg", 0.65, False, False),
    ("Unshakable Hope", "Sis. Ruth Elango", "Prophecy", 2023, "English", 34 * 60,
     None, "art-lightrays.jpg", 0.0, True, True),
    ("Strength in Stillness", "Pastor Mark Alvarez", "Prayer", 2024, "English", 18 * 60,
     None, "art-prayer-hands.jpg", 0.0, False, False),
    ("Carriers of Light", "Dr. Elias Thorne", "Youth", 2025, "English", 26 * 60,
     None, "art-lantern.jpg", 0.0, False, True),
    ("The Marriage Covenant", "Pastor David Chen", "Marriage", 2023, "English", 55 * 60,
     None, "art-mountains.jpg", 0.0, False, False),
    ("నమ్మకపు మార్గం", "Br. Prasad Rao", "Faith", 2024, "Telugu", 38 * 60,
     None, "art-wheat.jpg", 0.0, False, False),
    ("The Deepest Well", "Dr. Sarah Jenkins", "Bible Study", 2024, "English", 63 * 60,
     "Whoever drinks the water I give will never thirst. — John 4:14",
     "art-candle-bible.jpg", 0.0, False, False),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    storage = build_storage()

    # ensure categories exist
    await CategoryService(CategoryRepository(db)).seed_defaults_if_empty()

    trepo = TestimonyRepository(db)
    inserted = 0
    for (title, speaker, cat, year, lang, dur, verse, art_file, prog, fav, dl) in SEEDS:
        exists = await db.testimonies.find_one(
            {"title": title, "speaker": speaker, "year": year}, {"_id": 0, "id": 1}
        )
        if exists:
            continue

        t = Testimony(
            title=title, speaker=speaker, category=cat, year=year,
            language=lang, duration=dur, verse=verse,
            audio_url=SAMPLE_AUDIO,
            favorite=fav, downloaded=dl, progress=prog,
        )
        # copy artwork into storage keyed by testimony id, publish url
        src = ARTWORK_DIR / art_file
        if src.exists():
            data = src.read_bytes()
            key = f"artwork/{t.id}/{art_file}"
            t.art_url = await storage.save(key, data)
            t.art_key = key
        await trepo.insert(t)
        inserted += 1
        print(f"seeded: {title}")

    print(f"done. inserted={inserted}, total={await trepo.count()}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
