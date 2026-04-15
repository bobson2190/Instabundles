-- Main consolidated bundles table
CREATE TABLE bundles (
    id UUID PRIMARY KEY,
    store VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    ends_at TIMESTAMP,
    items JSONB DEFAULT '[]',   -- All items stored as a JSON array
    tiers JSONB DEFAULT '[]',   -- All tiers (with their items) stored as JSON
    raw_data JSONB,
    thread_id TEXT,
    reminded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

-- Channels for Discord subscriptions
CREATE TABLE channels (
    id VARCHAR(50) PRIMARY KEY,
    guild_id VARCHAR(50) NOT NULL,
    platforms TEXT[] NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Affiliate/Impact links tracking
CREATE TABLE impact_links (
    external_id VARCHAR(255) PRIMARY KEY,
    link TEXT NOT NULL,
    store VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    isChoice BOOLEAN DEFAULT false,
    isBooks BOOLEAN DEFAULT false
);

CREATE TABLE choice (
    id UUID PRIMARY KEY,
    store VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    ends_at TIMESTAMP,
    items JSONB DEFAULT '[]',   -- All items stored as a JSON array
    tiers JSONB DEFAULT '[]',   -- All tiers (with their items) stored as JSON
    raw_data JSONB,
    thread_id TEXT,
    reminded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

CREATE TABLE bookBundles (
    id UUID PRIMARY KEY,
    store VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    ends_at TIMESTAMP,
    items JSONB DEFAULT '[]',   -- All items stored as a JSON array
    tiers JSONB DEFAULT '[]',   -- All tiers (with their items) stored as JSON
    raw_data JSONB,
    thread_id TEXT,
    reminded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

CREATE INDEX idx_bundles_lookup ON bundles(store, external_id);

CREATE TABLE guild_configs (
    guild_id TEXT PRIMARY KEY,
    reminder_role_id TEXT,
    reminder_channel_id TEXT
);
