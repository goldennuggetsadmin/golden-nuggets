import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from supabase import create_client

def create_bucket():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    bucket_name = os.environ.get("SUPABASE_STORAGE_BUCKET", "sermons")
    client = create_client(url, key)
    try:
        res = client.storage.create_bucket(bucket_name, options={"public": True})
        print(f"Bucket '{bucket_name}' created successfully!", res)
    except Exception as e:
        print(f"Create bucket response: {e}")

if __name__ == "__main__":
    create_bucket()
