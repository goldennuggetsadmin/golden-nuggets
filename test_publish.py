import urllib.request
import json

# Login
login_url = "http://127.0.0.1:8000/api/v1/auth/login"
req = urllib.request.Request(
    login_url,
    data=json.dumps({"email": "admin@goldennuggets.com", "password": "Admin@123"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
resp = urllib.request.urlopen(req)
cookies = resp.headers.get_all("Set-Cookie")
cookie_header = "; ".join([c.split(";")[0] for c in cookies]) if cookies else ""

# Publish
publish_url = "http://127.0.0.1:8000/api/v1/admin/import/publish"
req_p = urllib.request.Request(
    publish_url,
    data=json.dumps({
        "source_url": "https://branham.org/en/messagestream/TEL=59-0329S",
        "title": "So Great Salvation",
        "sermon_code": "59-0329S",
        "status": "published"
    }).encode("utf-8"),
    headers={"Content-Type": "application/json", "Cookie": cookie_header}
)
try:
    resp_p = urllib.request.urlopen(req_p)
    print("SUCCESS", resp_p.read().decode())
except urllib.error.HTTPError as e:
    print("ERROR", e.code, e.read().decode())
