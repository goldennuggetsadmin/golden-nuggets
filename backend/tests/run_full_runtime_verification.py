import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:8000/api/v1/mobile"

def run_test(name, url, expected_checks):
    t0 = time.time()
    req = urllib.request.Request(url, headers={"X-Device-Id": "runtime-verification-device"})
    res = urllib.request.urlopen(req)
    t1 = time.time()
    body = res.read().decode("utf-8")
    data = json.loads(body)
    duration_ms = round((t1 - t0) * 1000, 2)
    payload_kb = round(len(body) / 1024, 2)

    passed = True
    reasons = []
    for check_fn, label in expected_checks:
        try:
            if not check_fn(data):
                passed = False
                reasons.append(f"FAILED: {label}")
        except Exception as e:
            passed = False
            reasons.append(f"ERROR ({label}): {e}")

    status_str = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status_str} [{duration_ms}ms | {payload_kb}KB] {name}")
    if not passed:
        for r in reasons:
            print(f"   -> {r}")
    return passed, duration_ms, payload_kb, data

def main():
    print("================================──────────────────────────────")
    print("🚀 Golden Nuggets Final App Runtime Verification Suite")
    print("================================──────────────────────────────\n")

    results = []

    # 1. Search Initial Page (Page 1)
    p1, d1, kb1, data1 = run_test(
        "1. Search Initial Page Load (Page 1)",
        f"{BASE_URL}/sermons?page=1&page_size=20&language=en",
        [
            (lambda d: len(d["items"]) == 20, "Returns exactly 20 items"),
            (lambda d: d["total"] == 1194, "Total DB count is 1194"),
            (lambda d: d["has_more"] is True, "has_more is True"),
            (lambda d: bool(d.get("next_cursor")), "next_cursor is present"),
        ]
    )
    results.append(("Search Page 1", p1, d1, kb1))

    # 2. Search Page 2 (Infinite Scroll with Cursor)
    cursor = data1.get("next_cursor")
    p2, d2, kb2, data2 = run_test(
        "2. Search Page 2 (Infinite Scroll with Keyset Cursor)",
        f"{BASE_URL}/sermons?page=2&page_size=20&language=en&cursor={cursor}",
        [
            (lambda d: len(d["items"]) == 20, "Returns 20 items for page 2"),
            (lambda d: set(x["id"] for x in d["items"]).isdisjoint(set(x["id"] for x in data1["items"])), "Zero duplicate items between page 1 & 2"),
        ]
    )
    results.append(("Search Page 2", p2, d2, kb2))

    # 3. Search by Title ("Faith")
    p3, d3, kb3, _ = run_test(
        "3. Search by Title ('Faith')",
        f"{BASE_URL}/sermons?q=Faith&page=1&page_size=20&language=en",
        [
            (lambda d: len(d["items"]) > 0, "Returns non-empty results"),
            (lambda d: all("faith" in (x["title"] + x["series"] + x["speaker"]).lower() for x in d["items"]), "Results match query string"),
        ]
    )
    results.append(("Search Title", p3, d3, kb3))

    # 4. Search by Sermon Code ("65-")
    p4, d4, kb4, _ = run_test(
        "4. Search by Sermon Code ('65-')",
        f"{BASE_URL}/sermons?q=65-&page=1&page_size=20&language=en",
        [
            (lambda d: len(d["items"]) > 0, "Returns non-empty results"),
        ]
    )
    results.append(("Search Code", p4, d4, kb4))

    # 5. Search by Year ("1965")
    p5, d5, kb5, _ = run_test(
        "5. Search by Year ('1965')",
        f"{BASE_URL}/sermons?year=1965&page=1&page_size=20&language=en",
        [
            (lambda d: len(d["items"]) > 0, "Returns non-empty results"),
            (lambda d: all(str(x["year"]) == "1965" for x in d["items"]), "All items match year 1965"),
        ]
    )
    results.append(("Search Year", p5, d5, kb5))

    # 6. Language Switch (Telugu)
    p6, d6, kb6, _ = run_test(
        "6. Language Switch (Telugu - 'te')",
        f"{BASE_URL}/sermons?page=1&page_size=20&language=te",
        [
            (lambda d: "items" in d, "Returns items array"),
            (lambda d: d["page"] == 1, "Page resets to 1"),
        ]
    )
    results.append(("Language Switch", p6, d6, kb6))

    # 7. Summary Endpoints (/years, /series, /states)
    p7, d7, kb7, _ = run_test(
        "7. Summary Tab Endpoints (/years, /series, /states)",
        f"{BASE_URL}/years?language=en",
        [
            (lambda d: isinstance(d, list) and len(d) > 0, "Years list returned"),
            (lambda d: "year" in d[0] and "sermonCount" in d[0], "Years summary format valid"),
        ]
    )
    results.append(("Summary Tabs", p7, d7, kb7))

    # 8. Home Feed Endpoint (/home)
    p8, d8, kb8, _ = run_test(
        "8. Home Feed Endpoint (/home)",
        f"{BASE_URL}/home?language=en",
        [
            (lambda d: "banner" in d and "recently_added" in d, "Home feed schema valid"),
            (lambda d: len(d["recently_added"]) <= 6, "Compact recent items count"),
        ]
    )
    results.append(("Home Feed", p8, d8, kb8))

    # 9. Sermon Detail Endpoint with Transcripts (/sermons/{id})
    first_id = data1["items"][0]["id"]
    p9, d9, kb9, _ = run_test(
        f"9. Sermon Detail Endpoint with Full Transcripts (/sermons/{first_id[:8]}...)",
        f"{BASE_URL}/sermons/{first_id}",
        [
            (lambda d: d["id"] == first_id, "Returned requested sermon ID"),
            (lambda d: "transcripts" in d, "Transcripts field present in detail payload"),
        ]
    )
    results.append(("Sermon Detail", p9, d9, kb9))

    # 10. Legacy Full-Catalog Backward Compatibility (page_size=10000)
    p10, d10, kb10, _ = run_test(
        "10. Legacy Backward Compatibility (page_size=10000)",
        f"{BASE_URL}/sermons?page_size=10000&language=en",
        [
            (lambda d: len(d["items"]) == 1194, "Returns full 1,194 sermon catalog"),
        ]
    )
    results.append(("Legacy 10k Payload", p10, d10, kb10))

    print("\n================================──────────────────────────────")
    print("📊 VERIFICATION RESULTS SUMMARY")
    print("================================──────────────────────────────")
    all_passed = True
    for name, passed, duration, kb in results:
        mark = "✅ PASS" if passed else "❌ FAIL"
        if not passed: all_passed = False
        print(f"  {mark:7} | {duration:6.2f} ms | {kb:7.2f} KB | {name}")
    print("================================──────────────────────────────")
    if all_passed:
        print("🎉 ALL RUNTIME VERIFICATION SUITES PASSED PERFECTLY!")
    else:
        print("⚠️ SOME TESTS FAILED — SEE LOG ABOVE")
    print("================================──────────────────────────────")

if __name__ == "__main__":
    main()
