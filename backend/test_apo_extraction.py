import asyncio
from db import connect, disconnect, get_pool
from services.transcript_service import process_sermon_transcripts, extract_transcript_from_pdf_bytes
from providers.storage import get_storage_provider
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

async def main():
    await connect()
    sermon_id = "e7bd6c54-4bd0-4879-9813-8a90a9d90013"
    
    # 1. Fetch file directly from storage
    provider = get_storage_provider()
    path = "golden-nuggets/pdf/fb67f545a1154657a20a430767e0c98b.pdf"
    try:
        data, content_type = provider.stream(path)
        print(f"Successfully streamed PDF from storage. Length={len(data)} bytes, ContentType={content_type}")
        
        # 2. Run extraction
        res = extract_transcript_from_pdf_bytes(data)
        print("Extraction Result:", res)
    except Exception as e:
        print("Error streaming/extracting:", e)
        import traceback
        traceback.print_exc()

    await disconnect()

asyncio.run(main())
