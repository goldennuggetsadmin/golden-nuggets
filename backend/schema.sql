-- ==============================================================================
-- Golden Nuggets Production PostgreSQL Schema
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(50),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- ------------------------------------------------------------------------------
-- SERMONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sermons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) DEFAULT '',
    date VARCHAR(50),
    year VARCHAR(10),
    location VARCHAR(255),
    state VARCHAR(255),
    series VARCHAR(255),
    language VARCHAR(50) DEFAULT 'en',
    description TEXT,
    duration VARCHAR(50),
    tags TEXT[] DEFAULT '{}',
    category_ids TEXT[] DEFAULT '{}',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_url TEXT,
    sermon_code VARCHAR(100),
    audio_url TEXT,
    audio_storage_path TEXT,
    artwork_url TEXT,
    artwork_storage_path TEXT,
    pdf_english_url TEXT,
    pdf_english_storage_path TEXT,
    pdf_telugu_url TEXT,
    pdf_telugu_storage_path TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    play_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sermons_status ON sermons(status);
CREATE INDEX IF NOT EXISTS idx_sermons_created_at ON sermons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sermons_speaker ON sermons(speaker);
CREATE INDEX IF NOT EXISTS idx_sermons_is_archived ON sermons(is_archived);

-- ------------------------------------------------------------------------------
-- MEETINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) DEFAULT '',
    description TEXT,
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    time VARCHAR(50),
    location VARCHAR(255),
    google_maps_url TEXT,
    youtube_url TEXT,
    registration_link TEXT,
    banner_url TEXT,
    banner_storage_path TEXT,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    notify_users BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- ------------------------------------------------------------------------------
-- MEDIA ASSETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(50) NOT NULL,
    original_filename TEXT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    provider VARCHAR(100) NOT NULL DEFAULT 'supabase',
    public_url TEXT,
    linked_type VARCHAR(100),
    linked_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_linked ON media_assets(linked_type, linked_id);

-- ------------------------------------------------------------------------------
-- HOME CONFIG (Singleton)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'global',
    featured_banner_sermon_id VARCHAR(255),
    featured_banner_meeting_id VARCHAR(255),
    featured_banner_title TEXT,
    featured_banner_subtitle TEXT,
    featured_banner_image_url TEXT,
    featured_banner_image_storage_path TEXT,
    featured_sermon_ids TEXT[] DEFAULT '{}',
    recently_added_count INTEGER NOT NULL DEFAULT 6,
    category_ids TEXT[] DEFAULT '{}',
    upcoming_meeting_ids TEXT[] DEFAULT '{}',
    show_recently_added BOOLEAN NOT NULL DEFAULT TRUE,
    show_upcoming_meetings BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    deep_link TEXT,
    audience VARCHAR(50) NOT NULL DEFAULT 'all',
    language VARCHAR(50),
    schedule_at VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    delivered_at VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- MOBILE EVENTS (Analytics)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mobile_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event VARCHAR(100) NOT NULL,
    sermon_id VARCHAR(255),
    meeting_id VARCHAR(255),
    query TEXT,
    position_seconds DOUBLE PRECISION,
    device_id VARCHAR(255),
    platform VARCHAR(50),
    app_version VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- SETTINGS (Singleton)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'global',
    ministry_name VARCHAR(255),
    support_email VARCHAR(255),
    default_language VARCHAR(50),
    weekly_banner BOOLEAN,
    storage_plan VARCHAR(50),
    backup_schedule VARCHAR(50),
    media_quality VARCHAR(50),
    keep_originals BOOLEAN,
    app_name VARCHAR(255),
    home_banner VARCHAR(255),
    default_sort VARCHAR(50),
    offline_downloads BOOLEAN,
    notify_new_sermon BOOLEAN,
    notify_before_meeting VARCHAR(100),
    quiet_hours VARCHAR(100),
    auto_meeting_reminders BOOLEAN,
    default_import_status VARCHAR(50),
    auto_download_pdfs BOOLEAN,
    auto_download_artwork BOOLEAN,
    auto_publish_trusted BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- LOGIN ATTEMPTS (Rate limiting/Security)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
    identifier VARCHAR(255) PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
);

-- ------------------------------------------------------------------------------
-- AUDIT LOGS / ACTIVITY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    message TEXT,
    metadata JSONB,
    ip_address VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);
