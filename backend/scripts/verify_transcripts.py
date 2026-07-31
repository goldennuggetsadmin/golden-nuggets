"""Generic Language-Independent Verification Audit CLI Tool.
Verifies PDF vs Database Transcript character-by-character for any sermon (Telugu, English, Tamil, Hindi, etc.).
"""
import asyncio
import argparse
import sys
import os

# Add parent backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from repositories.entities import sermons_repo
from providers.storage import get_storage_provider
from services.verifier import verify_transcript
import httpx


async def run_verification(sermon_id: str):
    print(f"--- Verifying Sermon Transcript Accuracy: {sermon_id} ---")
    doc = await sermons_repo().find_one({"id": sermon_id})
    if not doc:
        print(f"❌ Sermon {sermon_id} not found in database.")
        sys.exit(1)

    title = doc.get("title", "Untitled")
    language = doc.get("language", "Unknown")
    print(f"Sermon Title: {title}")
    print(f"Language:     {language}")

    # Read PDF Bytes
    pdf_bytes = None
    storage_path = doc.get("pdf_telugu_storage_path") or doc.get("pdf_english_storage_path")
    if storage_path:
        try:
            provider = get_storage_provider()
            data, _ = provider.stream(storage_path)
            pdf_bytes = data
        except Exception as e:
            print(f"Warning: Failed reading storage path {storage_path}: {e}")

    if not pdf_bytes:
        pdf_url = doc.get("pdf_telugu_url") or doc.get("pdf_english_url")
        if pdf_url:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                resp = await client.get(pdf_url)
            if resp.status_code < 400:
                pdf_bytes = resp.content

    if not pdf_bytes:
        print("❌ Could not obtain PDF bytes for verification.")
        sys.exit(1)

    paragraphs = doc.get("transcripts") or []
    res = verify_transcript(pdf_bytes, paragraphs)

    print("\n--- VERIFICATION AUDIT REPORT ---")
    print(f"PDF SHA-256:             {res.get('pdf_sha256')}")
    print(f"Paragraph Count:         {res.get('paragraphs')}")
    print(f"Total Character Count:   {res.get('characters')}")
    print(f"Exact Match Percentage:  {res.get('exact_match_percentage')}%")
    print(f"Differences Found:       {res.get('differences')}")
    print(f"Verified Status:         {'✅ PASSED' if res.get('verified') else '❌ FAILED'}")

    if not res.get('verified'):
        print(f"Failure Reason:          {res.get('failure_reason')}")
        print("\n--- Detailed Forensic Audit (First 10 Mismatches) ---")
        for diff in res.get("audit_report", [])[:10]:
            print(diff)
        sys.exit(1)
    else:
        print("\n🎉 100.0% Character-for-Character Verification Passed!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify sermon transcript accuracy against source PDF")
    parser.add_argument("sermon_id", help="Sermon ID to verify")
    args = parser.parse_args()

    asyncio.run(run_verification(args.sermon_id))
