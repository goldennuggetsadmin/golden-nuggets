import asyncio
import httpx
from reportlab.pdfgen import canvas
from io import BytesIO

async def main():
    # 1. Create dummy PDF
    buffer = BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Hello World from Manual Upload!")
    c.save()
    pdf_bytes = buffer.getvalue()

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # Get admin token (assuming standard login)
        resp = await client.post("/api/v1/admin/auth/login", json={"email": "admin@example.com", "password": "password"})
        if resp.status_code != 200:
            print("Login failed, trying alternative or no auth...")
            token = "dummy"
        else:
            token = resp.json().get("access_token")
        
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload Media
        print("Uploading PDF...")
        files = {"file": ("test.pdf", pdf_bytes, "application/pdf")}
        resp = await client.post("/api/v1/admin/media/upload", params={"kind": "pdf"}, files=files, headers=headers)
        if resp.status_code != 200:
            print("Upload failed:", resp.text)
            return
        upload_data = resp.json()
        storage_path = upload_data.get("storage_path")
        print("Upload successful, path:", storage_path)

        # 3. Create Sermon
        print("Creating sermon...")
        sermon_payload = {
            "title": "Test Manual Upload Sermon",
            "speaker": "Test Speaker",
            "date": "2026-07-24",
            "language": "English",
            "status": "published",
            "pdf_english_storage_path": storage_path,
        }
        resp = await client.post("/api/v1/admin/sermons", json=sermon_payload, headers=headers)
        if resp.status_code != 200:
            print("Create sermon failed:", resp.text)
            return
        sermon_id = resp.json().get("id")
        print("Sermon created:", sermon_id)

        # 4. Wait a bit for background extraction
        print("Waiting for background task...")
        await asyncio.sleep(3)

        # 5. Fetch Sermon and check transcripts
        resp = await client.get(f"/api/v1/mobile/sermons/{sermon_id}")
        if resp.status_code != 200:
            print("Failed to fetch sermon mobile:", resp.text)
            return
        
        mobile_sermon = resp.json()
        print("Transcripts extracted:", len(mobile_sermon.get("transcripts", [])))
        print("Transcript parsed:", mobile_sermon.get("transcript_parsed"))
        if mobile_sermon.get("transcripts"):
            print("First paragraph text:", mobile_sermon["transcripts"][0].get("text"))

if __name__ == "__main__":
    asyncio.run(main())
