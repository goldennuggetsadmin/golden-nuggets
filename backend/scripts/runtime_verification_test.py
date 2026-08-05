import json
import urllib.request

def run_runtime_verification():
    print("==========================================================================================")
    print("RUNTIME VERIFICATION TEST — SEARCH YEARS SCREEN DATAFLOW VALIDATION")
    print("==========================================================================================")

    # 1. TEST FRESH API ENDPOINT (GET /api/v1/mobile/years)
    years_url = "http://localhost:8000/api/v1/mobile/years"
    print(f"\n1. FETCHING LIVE ENDPOINT: {years_url}")
    
    try:
        req = urllib.request.Request(years_url)
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            body_text = response.read().decode('utf-8')
            years_data = json.loads(body_text)
            
            print(f"   HTTP Status: {status_code} OK")
            print(f"   Total Year Summary Cards Returned: {len(years_data)}")
    except Exception as e:
        print(f"   FAILED to connect to backend on port 8000: {e}")
        return

    # 2. VERIFY EXACT 19 YEARS (1965 to 1947)
    expected_counts = {
        1965: 53, 1964: 76, 1963: 95, 1962: 101, 1961: 92,
        1960: 91, 1959: 82, 1958: 88, 1957: 93, 1956: 82,
        1955: 88, 1954: 79, 1953: 87, 1952: 13, 1951: 32,
        1950: 31, 1949: 2,  1948: 4,  1947: 6
    }

    print("\n2. VERIFYING ALL 19 YEAR CARDS IN DESCENDING ORDER:")
    print(f"{'INDEX':<6} | {'YEAR CARD':<12} | {'EXPECTED COUNT':<16} | {'LIVE API COUNT':<16} | {'MATCH STATUS':<15}")
    print("-" * 75)

    all_matched = True
    for idx, item in enumerate(years_data, start=1):
        yr = item["year"]
        count = item["sermonCount"]
        exp_c = expected_counts.get(yr, -1)
        match = "MATCH" if count == exp_c else "MISMATCH"
        if match == "MISMATCH":
            all_matched = False
        print(f"{idx:<6} | Year {yr:<7} | {exp_c:<16} | {count:<16} | {match:<15}")

    print("-" * 75)

    # 3. VERIFY SPECIFIC YEARS REQUESTED (1965, 1954, 1953, 1950, 1947)
    print("\n3. VERIFYING SPECIFIC YEARS EXTRACTED & EXPANDED:")
    check_years = [1965, 1954, 1953, 1950, 1947]
    for cy in check_years:
        match_item = next((item for item in years_data if item["year"] == cy), None)
        if match_item:
            print(f"   [EXPAND CARD] Year {cy}: {match_item['sermonCount']} Sermons — OK")
        else:
            print(f"   [EXPAND CARD] Year {cy}: MISSING!")
            all_matched = False

    # 4. FETCH FULL SERMON CATALOG (/api/v1/mobile/sermons?page_size=10000)
    sermons_url = "http://localhost:8000/api/v1/mobile/sermons?page_size=10000"
    print(f"\n4. FETCHING MASTER CATALOG: {sermons_url}")
    try:
        req = urllib.request.Request(sermons_url)
        with urllib.request.urlopen(req) as response:
            sermons_data = json.loads(response.read().decode('utf-8'))
            items = sermons_data.get("items", [])
            print(f"   HTTP Status: {response.getcode()} OK")
            print(f"   Total Master Sermons Received: {len(items)} (Target: 1195)")
    except Exception as e:
        print(f"   FAILED to fetch master catalog: {e}")
        return

    print("\n==========================================================================================")
    if len(years_data) == 19 and len(items) == 1195 and all_matched:
        print("SUCCESS: RUNTIME VERIFICATION 100% PASSED!")
        print("All 19 years (1965 down to 1947) are live, accurate, and match 1,195 published sermons.")
    else:
        print("FAILURE: RUNTIME VERIFICATION MISMATCH DETECTED!")
    print("==========================================================================================\n")

if __name__ == "__main__":
    run_runtime_verification()
