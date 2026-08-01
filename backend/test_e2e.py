import asyncio
import httpx
from datetime import datetime
import os
import uuid

API_URL = "http://localhost:8000/api/v1"
client = httpx.AsyncClient(base_url=API_URL, follow_redirects=True)

async def run_tests():
    suffix = str(uuid.uuid4())[:8]
    cat_id = None
    sermon_id = None
    artwork_id = None
    meeting_id = None

    try:
        print("--- 1. Login ---")
        resp = await client.post("/auth/login", json={"email": "test@goldennuggets.org", "password": "password123"})
        if resp.status_code != 200:
            print("Login failed:", resp.status_code, resp.text)
            return
        print("Login OK. User:", resp.json())
        
        print("\n--- 2. Create Category ---")
        resp = await client.post("/admin/categories", json={"name": f"Test Category {suffix}", "slug": f"test-category-{suffix}", "description": "A test category"})
        if resp.status_code != 200:
            print("Create Category failed:", resp.status_code, resp.text)
            return
        cat_id = resp.json()["id"]
        print("Category OK. ID:", cat_id)

        print("\n--- 3. Upload Media (Thumbnail) ---")
        files = {"file": (f"thumb_{suffix}.png", b"dummy image data", "image/png")}
        resp = await client.post("/admin/media/upload?kind=artwork", files=files)
        if resp.status_code != 200:
            print("Upload Media failed:", resp.status_code, resp.text)
            return
        artwork_id = resp.json()["id"]
        artwork_url = resp.json()["public_url"]
        print("Artwork OK. URL:", artwork_url)

        print("\n--- 4. Create Sermon ---")
        sermon_data = {
            "title": f"Test Sermon {suffix}",
            "speaker": "Test Speaker",
            "category_ids": [cat_id],
            "status": "published",
            "artwork_url": artwork_url,
            "artwork_storage_path": resp.json()["storage_path"]
        }
        resp = await client.post("/admin/sermons", json=sermon_data)
        if resp.status_code != 200:
            print("Create Sermon failed:", resp.status_code, resp.text)
            return
        sermon_id = resp.json()["id"]
        print("Sermon OK. ID:", sermon_id)

        print("\n--- 5. Edit Sermon ---")
        resp = await client.patch(f"/admin/sermons/{sermon_id}", json={"title": f"Test Sermon Edited {suffix}"})
        if resp.status_code != 200:
            print("Edit Sermon failed:", resp.status_code, resp.text)
            return
        print("Edit Sermon OK. New title:", resp.json()["title"])

        print("\n--- 6. Dashboard ---")
        resp = await client.get("/admin/dashboard/stats")
        if resp.status_code != 200:
            print("Dashboard Stats failed:", resp.status_code, resp.text)
            return
        print("Dashboard Stats OK.", resp.json())

        print("\n--- 7. Media Manager Search ---")
        resp = await client.get(f"/admin/media?q={suffix}&page=1&page_size=20")
        if resp.status_code != 200:
            print("Media Search failed:", resp.status_code, resp.text)
            return
        print("Media Search OK. Found:", resp.json()["total"])

        print("\n--- 8. Create Meeting ---")
        meeting_data = {
            "title": f"Test Meeting {suffix}",
            "status": "live",
            "start_date": "2026-07-21"
        }
        resp = await client.post("/admin/meetings", json=meeting_data)
        if resp.status_code != 200:
            print("Create Meeting failed:", resp.status_code, resp.text)
            return
        meeting_id = resp.json()["id"]
        print("Meeting OK. ID:", meeting_id)
        
        print("\n--- All Tests Passed! ---")

    finally:
        print("\n--- 9. Clean up (Delete) ---")
        if meeting_id: await client.delete(f"/admin/meetings/{meeting_id}")
        if sermon_id: await client.delete(f"/admin/sermons/{sermon_id}")
        if cat_id: await client.delete(f"/admin/categories/{cat_id}")
        if artwork_id: await client.delete(f"/admin/media/{artwork_id}")
        print("Cleanup OK.")

asyncio.run(run_tests())
