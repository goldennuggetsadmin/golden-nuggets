import requests
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL = "admin@goldennuggets.com"
ADMIN_PASSWORD = "Admin@123"

def run_tests():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    print("1. Testing Health Endpoint...")
    r = s.get(f"{BASE_URL}/health")
    assert r.status_code == 200, f"Health failed: {r.status_code} {r.text}"
    print("✓ Health endpoint OK:", r.json())

    print("2. Testing Login...")
    r = s.post(f"{BASE_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    user = r.json()
    print("✓ Login OK for user:", user["email"])

    import uuid
    uid = uuid.uuid4().hex[:8]
    print("3. Testing Categories CRUD...")
    # Create category
    r = s.post(f"{BASE_URL}/admin/categories", json={"name": f"Test Category {uid}", "slug": f"test-cat-{uid}", "description": "Test"})
    assert r.status_code == 200, f"Create category failed: {r.text}"
    cat_id = r.json()["id"]
    print("✓ Created category:", cat_id)

    # List categories
    r = s.get(f"{BASE_URL}/admin/categories")
    assert r.status_code == 200
    print(f"✓ Listed {len(r.json())} categories")

    # Update category
    r = s.patch(f"{BASE_URL}/admin/categories/{cat_id}", json={"name": "Updated Category", "slug": f"test-cat-updated-{uid}"})
    assert r.status_code == 200, f"Update category failed: {r.status_code} {r.text}"
    print("✓ Updated category")

    print("4. Testing Sermons CRUD...")
    # Create sermon
    r = s.post(f"{BASE_URL}/admin/sermons", json={"title": "Test Sermon", "speaker": "Pastor John", "category_ids": [cat_id]})
    assert r.status_code == 200, f"Create sermon failed: {r.text}"
    sermon_id = r.json()["id"]
    print("✓ Created sermon:", sermon_id)

    # List sermons
    r = s.get(f"{BASE_URL}/admin/sermons")
    assert r.status_code == 200
    print("✓ Listed sermons")

    # Delete sermon
    r = s.delete(f"{BASE_URL}/admin/sermons/{sermon_id}")
    assert r.status_code == 200
    print("✓ Deleted sermon")

    print("5. Testing Meetings CRUD...")
    # Create meeting
    r = s.post(f"{BASE_URL}/admin/meetings", json={"title": "Sunday Service", "location": "Main Hall"})
    assert r.status_code == 200, f"Create meeting failed: {r.text}"
    meeting_id = r.json()["id"]
    print("✓ Created meeting:", meeting_id)

    # Delete meeting
    r = s.delete(f"{BASE_URL}/admin/meetings/{meeting_id}")
    assert r.status_code == 200
    print("✓ Deleted meeting")

    # Delete category cleanup
    r = s.delete(f"{BASE_URL}/admin/categories/{cat_id}")
    assert r.status_code == 200
    print("✓ Deleted category")

    print("6. Testing Settings Endpoint...")
    r = s.get(f"{BASE_URL}/admin/settings")
    assert r.status_code == 200
    print("✓ Settings read OK")

    print("7. Testing Mobile API Endpoints...")
    r = s.get("http://127.0.0.1:8000/api/v1/mobile/home")
    assert r.status_code == 200
    print("✓ Mobile home OK")

    r = s.post("http://127.0.0.1:8000/api/v1/mobile/analytics/event", json={"event": "play", "platform": "ios"})
    assert r.status_code == 200, f"Mobile event failed: {r.status_code} {r.text}"
    print("✓ Mobile event tracking OK")

    print("\n==========================================")
    print("ALL E2E API VERIFICATIONS PASSED CLEANLY!")
    print("==========================================")

if __name__ == "__main__":
    run_tests()
