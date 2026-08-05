-- 2026_08_05_search_indexes.sql
-- Production database indexes for Golden Nuggets search, filtering, and keyset pagination.

CREATE INDEX IF NOT EXISTS idx_sermons_language ON sermons(language);
CREATE INDEX IF NOT EXISTS idx_sermons_year ON sermons(year);
CREATE INDEX IF NOT EXISTS idx_sermons_series ON sermons(series);
CREATE INDEX IF NOT EXISTS idx_sermons_code ON sermons(sermon_code);
CREATE INDEX IF NOT EXISTS idx_sermons_created_id ON sermons(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sermons_status_lang ON sermons(status, is_archived, language);
