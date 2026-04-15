import 'dotenv/config';
import { Pool } from 'pg';

let url = process.env.DATABASE_URL;
if (process.argv.includes('--test')) {url = process.env.TEST_DATABASE_URL;}

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const schema = `
-- Main consolidated bundles table
CREATE TABLE IF NOT EXISTS bundles (
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
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

-- Channels for Discord subscriptions
CREATE TABLE IF NOT EXISTS channels (
    id VARCHAR(50) PRIMARY KEY,
    guild_id VARCHAR(50) NOT NULL,
    platforms TEXT[] NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Affiliate/Impact links tracking
CREATE TABLE IF NOT EXISTS impact_links (
    external_id VARCHAR(255) PRIMARY KEY,
    link TEXT NOT NULL,
    store VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    isChoice BOOLEAN DEFAULT false,
    isBooks BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS choice (
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
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

CREATE TABLE IF NOT EXISTS bookBundles (
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
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(store, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bundles_lookup ON bundles(store, external_id);

`;

async function migrate() {
  console.log('Starting database migration...');
  try {
    await pool.query(schema);
    console.log('Tables created successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();