"""Sanctuary API tests — verifies core endpoints, home feed, search, transcript upload, and media."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else "https://sermon-stream-9.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# --- health ---
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# --- categories ---
def test_categories(s):
    r = s.get(f"{API}/categories", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) == 10
    for c in data:
        assert "name" in c and "tone" in c and "order" in c
        assert "_id" not in c
    # sorted by order
    orders = [c["order"] for c in data]
    assert orders == sorted(orders)


# --- testimonies list ---
def test_list_testimonies(s):
    r = s.get(f"{API}/testimonies", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 10
    for t in data:
        assert "_id" not in t
        assert "id" in t and "title" in t and "speaker" in t
        if t.get("art_url"):
            assert "/api/media/" in t["art_url"]


# --- home feed ---
def test_home_feed(s):
    r = s.get(f"{API}/testimonies/home", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["continue_listening", "recently_added", "featured", "popular", "categories"]:
        assert k in d
    assert len(d["categories"]) == 10
    assert len(d["recently_added"]) > 0
    cl = d["continue_listening"]
    assert cl is not None
    assert 0 < cl["progress"] < 1


# --- single testimony ---
def test_get_testimony_and_404(s):
    lst = s.get(f"{API}/testimonies", timeout=15).json()
    tid = lst[0]["id"]
    r = s.get(f"{API}/testimonies/{tid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == tid
    assert "_id" not in r.json()

    r404 = s.get(f"{API}/testimonies/does-not-exist-xyz", timeout=15)
    assert r404.status_code == 404


# --- patch favorite ---
def test_patch_favorite(s):
    lst = s.get(f"{API}/testimonies", timeout=15).json()
    tid = lst[0]["id"]
    original = lst[0].get("favorite", False)

    r = s.patch(f"{API}/testimonies/{tid}", json={"favorite": True}, timeout=15)
    assert r.status_code == 200
    assert r.json()["favorite"] is True

    # verify via GET
    got = s.get(f"{API}/testimonies/{tid}", timeout=15).json()
    assert got["favorite"] is True

    # restore
    s.patch(f"{API}/testimonies/{tid}", json={"favorite": original}, timeout=15)


# --- search ---
def test_search_all_peace(s):
    r = s.get(f"{API}/testimonies/search", params={"q": "peace"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    # at least one title/verse contains 'peace'
    joined = " ".join(f"{t.get('title','')} {t.get('verse','') or ''}" for t in data).lower()
    assert "peace" in joined


def test_search_by_speaker_jenkins(s):
    r = s.get(f"{API}/testimonies/search", params={"q": "Jenkins", "field": "speaker"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    for t in data:
        assert "jenkins" in t["speaker"].lower()


# --- transcript upload ---
@pytest.fixture(scope="module")
def transcript_target(s):
    lst = s.get(f"{API}/testimonies", timeout=15).json()
    return lst[0]["id"]


def test_transcript_upload_english(s, transcript_target):
    tid = transcript_target
    with open("/tmp/sample_en.pdf", "rb") as f:
        r = s.post(
            f"{API}/testimonies/{tid}/transcript",
            data={"language": "English"},
            files={"file": ("sample_en.pdf", f, "application/pdf")},
            timeout=30,
        )
    assert r.status_code == 200, r.text
    body = r.json()
    langs = [tr["language"] for tr in body.get("transcripts", [])]
    assert "English" in langs

    # verify via GET
    got = s.get(f"{API}/testimonies/{tid}", timeout=15).json()
    en = [t for t in got["transcripts"] if t["language"] == "English"]
    assert en and len(en[0]["text"]) > 0


def test_transcript_upload_telugu_and_upsert(s, transcript_target):
    tid = transcript_target
    with open("/tmp/sample_te.pdf", "rb") as f:
        r = s.post(
            f"{API}/testimonies/{tid}/transcript",
            data={"language": "Telugu"},
            files={"file": ("sample_te.pdf", f, "application/pdf")},
            timeout=30,
        )
    assert r.status_code == 200
    body = r.json()
    tel = [t for t in body["transcripts"] if t["language"] == "Telugu"]
    assert len(tel) == 1
    first_url = tel[0]["pdf_url"]

    # re-upload → upsert (still one Telugu entry, url should change)
    with open("/tmp/sample_te_v2.pdf", "rb") as f:
        r2 = s.post(
            f"{API}/testimonies/{tid}/transcript",
            data={"language": "Telugu"},
            files={"file": ("sample_te_v2.pdf", f, "application/pdf")},
            timeout=30,
        )
    assert r2.status_code == 200
    body2 = r2.json()
    tel2 = [t for t in body2["transcripts"] if t["language"] == "Telugu"]
    assert len(tel2) == 1
    assert tel2[0]["pdf_url"] != first_url


def test_transcript_invalid_language(s, transcript_target):
    with open("/tmp/sample_en.pdf", "rb") as f:
        r = s.post(
            f"{API}/testimonies/{transcript_target}/transcript",
            data={"language": "French"},
            files={"file": ("x.pdf", f, "application/pdf")},
            timeout=15,
        )
    assert r.status_code == 400


# --- media serving ---
def test_media_serving(s):
    lst = s.get(f"{API}/testimonies", timeout=15).json()
    art = next((t["art_url"] for t in lst if t.get("art_url")), None)
    assert art, "no art_url on any testimony"
    # art_url is absolute; hit as-is
    url = art if art.startswith("http") else f"{BASE_URL}{art}"
    r = s.get(url, timeout=15)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "image" in ct or "octet-stream" in ct


def test_media_404(s):
    r = s.get(f"{API}/media/does/not/exist.jpg", timeout=15)
    assert r.status_code == 404


# --- global _id check ---
def test_no_mongo_id_leak(s):
    endpoints = [f"{API}/categories", f"{API}/testimonies", f"{API}/testimonies/home"]
    for ep in endpoints:
        body = s.get(ep, timeout=15).text
        assert '"_id"' not in body, f"_id leaked in {ep}"
