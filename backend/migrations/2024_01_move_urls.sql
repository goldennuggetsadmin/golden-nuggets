-- Migration to replace signed URLs with storage_path references
CREATE OR REPLACE FUNCTION extract_path(signed_url TEXT) RETURNS TEXT AS $$
DECLARE parts TEXT[];
BEGIN
    IF signed_url IS NULL THEN
        RETURN NULL;
    END IF;
    parts := regexp_split_to_array(signed_url, '/object/');
    IF array_length(parts, 1) > 1 THEN
        RETURN parts[2];
    END IF;
    RETURN signed_url;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE sermons ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS artwork_storage_path TEXT;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS pdf_english_storage_path TEXT;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS pdf_telugu_storage_path TEXT;

UPDATE sermons SET audio_storage_path = extract_path(audio_url) WHERE audio_url IS NOT NULL AND audio_storage_path IS NULL;
UPDATE sermons SET artwork_storage_path = extract_path(artwork_url) WHERE artwork_url IS NOT NULL AND artwork_storage_path IS NULL;
UPDATE sermons SET pdf_english_storage_path = extract_path(pdf_english_url) WHERE pdf_english_url IS NOT NULL AND pdf_english_storage_path IS NULL;
UPDATE sermons SET pdf_telugu_storage_path = extract_path(pdf_telugu_url) WHERE pdf_telugu_url IS NOT NULL AND pdf_telugu_storage_path IS NULL;

CREATE INDEX IF NOT EXISTS idx_sermons_audio_storage_path ON sermons(audio_storage_path);
CREATE INDEX IF NOT EXISTS idx_sermons_artwork_storage_path ON sermons(artwork_storage_path);
CREATE INDEX IF NOT EXISTS idx_sermons_pdf_english_storage_path ON sermons(pdf_english_storage_path);
CREATE INDEX IF NOT EXISTS idx_sermons_pdf_telugu_storage_path ON sermons(pdf_telugu_storage_path);
