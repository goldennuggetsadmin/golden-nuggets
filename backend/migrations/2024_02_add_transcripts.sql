-- Add transcript fields to sermons table
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcripts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_page_count INTEGER DEFAULT 0;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_paragraph_count INTEGER DEFAULT 0;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_parsed BOOLEAN DEFAULT FALSE;
ALTER TABLE sermons ADD COLUMN IF NOT EXISTS transcript_parser_version VARCHAR(50) DEFAULT '1.0';
