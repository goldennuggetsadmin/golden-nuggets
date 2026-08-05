import pytest
from models import Sermon, SermonCreate, SermonUpdate
from routers.mobile import _project_sermon
from services.transcript_service import validate_pdf_bytes

def test_sermon_model_pdf_metadata_fields():
    """Verify Sermon model includes all enterprise PDF metadata fields."""
    sermon = Sermon(
        title="Testing Official PDF Download",
        speaker="William Marrion Branham",
        year="1965",
        english_pdf_storage_path="sermons/1965/65-1212/english/transcript/original.pdf",
        english_pdf_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        english_pdf_size=1048576,
        english_pdf_filename="65-1212_English.pdf",
        english_pdf_page_count=32,
        telugu_pdf_storage_path="sermons/1965/65-1212/telugu/transcript/original.pdf",
        telugu_pdf_hash="f4c0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856",
        telugu_pdf_size=1200000,
        telugu_pdf_filename="65-1212_Telugu.pdf",
        telugu_pdf_page_count=34,
    )
    d = sermon.model_dump()
    assert d["english_pdf_storage_path"] == "sermons/1965/65-1212/english/transcript/original.pdf"
    assert d["english_pdf_hash"] == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    assert d["english_pdf_size"] == 1048576
    assert d["english_pdf_filename"] == "65-1212_English.pdf"
    assert d["english_pdf_page_count"] == 32
    assert d["telugu_pdf_storage_path"] == "sermons/1965/65-1212/telugu/transcript/original.pdf"
    assert d["telugu_pdf_hash"] == "f4c0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856"
    assert d["telugu_pdf_size"] == 1200000
    assert d["telugu_pdf_filename"] == "65-1212_Telugu.pdf"
    assert d["telugu_pdf_page_count"] == 34


import asyncio

def test_mobile_sermon_projection_pdf_metadata():
    """Verify _project_sermon projects english_pdf_* and telugu_pdf_* metadata alongside legacy aliases."""
    raw_sermon = {
        "id": "test-sermon-123",
        "title": "The Communion",
        "speaker": "William Marrion Branham",
        "sermon_code": "65-1212",
        "english_pdf_storage_path": "sermons/1965/65-1212/english/transcript/original.pdf",
        "english_pdf_hash": "abc123hash",
        "english_pdf_size": 250000,
        "english_pdf_filename": "65-1212_English.pdf",
        "english_pdf_page_count": 24,
        "telugu_pdf_storage_path": "sermons/1965/65-1212/telugu/transcript/original.pdf",
        "telugu_pdf_hash": "def456hash",
        "telugu_pdf_size": 260000,
        "telugu_pdf_filename": "65-1212_Telugu.pdf",
        "telugu_pdf_page_count": 26,
    }

    projected = asyncio.run(_project_sermon(raw_sermon))

    assert projected["id"] == "test-sermon-123"
    assert projected["english_pdf_hash"] == "abc123hash"
    assert projected["english_pdf_size"] == 250000
    assert projected["english_pdf_filename"] == "65-1212_English.pdf"
    assert projected["english_pdf_page_count"] == 24
    assert projected["telugu_pdf_hash"] == "def456hash"
    assert projected["telugu_pdf_size"] == 260000
    assert projected["telugu_pdf_filename"] == "65-1212_Telugu.pdf"
    assert projected["telugu_pdf_page_count"] == 26
    # Backward compatibility aliases
    assert "pdf_english_url" in projected
    assert "pdf_telugu_url" in projected


def test_validate_pdf_bytes_empty_and_oversized():
    """Verify validate_pdf_bytes rejects empty and oversized PDF bytes (>100MB)."""
    # Empty / too small
    is_valid, msg, count = validate_pdf_bytes(b"")
    assert not is_valid
    assert "empty" in msg.lower() or "invalid" in msg.lower()

    # Oversized > 100MB
    fake_large_bytes = b"0" * (100 * 1024 * 1024 + 1)
    is_valid, msg, count = validate_pdf_bytes(fake_large_bytes)
    assert not is_valid
    assert "exceeds" in msg.lower() or "maximum" in msg.lower()
