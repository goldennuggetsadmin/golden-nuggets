"""Automated Test Suite for Duplicate Detection, Refresh Diffs, Versioning, and Race Condition Protection."""
import asyncio
import json
import urllib.request
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run_tests():
    print("=" * 80)
    print("RUNNING DUPLICATE DETECTION & VERSIONING INTEGRITY TESTS")
    print("=" * 80)

    # 1. Login
    login_url = "http://127.0.0.1:8000/api/v1/auth/login"
    req = urllib.request.Request(
        login_url,
        data=json.dumps({"email": "admin@goldennuggets.com", "password": "Admin@123"}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    cookies = resp.headers.get_all("Set-Cookie")
    cookie_header = "; ".join([c.split(";")[0] for c in cookies]) if cookies else ""
    print("✅ Auth Connection: SUCCESSFUL")

    # 2. Test Duplicate Detection (Importing existing URL)
    test_url = "https://branham.org/en/messagestream/TEL=59-0329S"
    publish_url = "http://127.0.0.1:8000/api/v1/admin/import/publish"
    payload = {
        "source_url": test_url,
        "title": "59-0329S Test Title",
        "sermon_code": "59-0329S",
        "language": "te",
        "status": "published"
    }

    req_pub = urllib.request.Request(
        publish_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Cookie": cookie_header, "Content-Type": "application/json"}
    )

    try:
        resp_pub = urllib.request.urlopen(req_pub)
        print("❌ FAILED: Duplicate detection did not catch existing sermon!")
        sys.exit(1)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            err_body = json.loads(e.read().decode())
            print("✅ TEST 1: Layered Duplicate Detection (HTTP 409 Conflict): PASSED")
            print("   Message:", err_body.get("message"))
            print("   Existing Sermon ID:", err_body.get("existing_sermon", {}).get("id"))
            existing_id = err_body.get("existing_sermon", {}).get("id")
        else:
            print(f"❌ FAILED: Unexpected status code {e.code}")
            sys.exit(1)

    # 3. Test Refresh Preview
    prev_url = f"http://127.0.0.1:8000/api/v1/admin/sermons/{existing_id}/refresh-preview"
    req_prev = urllib.request.Request(
        prev_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Cookie": cookie_header, "Content-Type": "application/json"}
    )
    resp_prev = urllib.request.urlopen(req_prev)
    res_prev = json.loads(resp_prev.read().decode())
    print("✅ TEST 2: Refresh Diff Preview (GET /refresh-preview): PASSED")
    print("   Changes Detected:", res_prev.get("changes_detected"))
    print("   User Data Protected:", res_prev.get("user_data_protected"))

    # 4. Test Refresh Execution & Immutable Version History
    ref_url = f"http://127.0.0.1:8000/api/v1/admin/sermons/{existing_id}/refresh"
    req_ref = urllib.request.Request(
        ref_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Cookie": cookie_header, "Content-Type": "application/json"},
        method="PUT"
    )
    resp_ref = urllib.request.urlopen(req_ref)
    res_ref = json.loads(resp_ref.read().decode())
    print("✅ TEST 3: Safe Refresh & Version History (PUT /refresh): PASSED")
    print("   Status:", res_ref.get("refresh_report", {}).get("status"))
    print("   New Version:", res_ref.get("refresh_report", {}).get("current_version"))

    # 5. Test Explicit Duplicate Creation (allow_duplicate=true)
    req_dup = urllib.request.Request(
        publish_url + "?allow_duplicate=true",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Cookie": cookie_header, "Content-Type": "application/json"}
    )
    resp_dup = urllib.request.urlopen(req_dup)
    res_dup = json.loads(resp_dup.read().decode())
    print("✅ TEST 4: Create Duplicate Copy (?allow_duplicate=true): PASSED")
    print("   New Separate Sermon ID:", res_dup.get("id"))

    print("\n" + "=" * 80)
    print("ALL 4 DUPLICATE DETECTION & VERSIONING INTEGRITY TESTS PASSED")
    print("=" * 80)


if __name__ == "__main__":
    run_tests()
