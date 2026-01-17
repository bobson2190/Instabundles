-- Run this to set up your database tables

CREATE TABLE bundles (
    id UUID PRIMARY KEY,
    store VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    name VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

CREATE TABLE bundle_items (
    id UUID PRIMARY KEY,
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    url TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE channels (
    id VARCHAR(50) PRIMARY KEY,
    guild_id VARCHAR(50) NOT NULL,
    platforms TEXT[] NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bundles_store_external ON bundles(store, external_id);
CREATE INDEX idx_channels_platforms ON channels USING GIN(platforms);