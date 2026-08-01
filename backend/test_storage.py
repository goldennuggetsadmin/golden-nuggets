import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from providers.storage.supabase import SupabaseStorageProvider

def test_storage():
    provider = SupabaseStorageProvider()
    print(f"Testing storage provider: {provider.name}, bucket: {provider.bucket}")
    
    test_path = "test/test_file.txt"
    test_content = b"Hello Supabase Storage!"
    
    # Upload
    print("Uploading test file...")
    upload_res = provider.upload(test_path, test_content, "text/plain")
    print("Upload result:", upload_res)
    
    # Check exists
    exists = provider.exists(test_path)
    print("File exists:", exists)
    assert exists is True, "File should exist"
    
    # Public URL
    url = provider.get_public_url(test_path)
    print("Public URL:", url)
    
    # Download
    data, content_type = provider.stream(test_path)
    print(f"Downloaded content: {data.decode('utf-8')}, content_type: {content_type}")
    assert data == test_content
    
    # Delete
    print("Deleting test file...")
    provider.delete(test_path)
    
    exists_after = provider.exists(test_path)
    print("File exists after delete:", exists_after)
    assert exists_after is False, "File should be deleted"
    
    print("ALL STORAGE TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_storage()
