import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const schema = `
  -- Create Bundles Table
  CREATE TABLE IF NOT EXISTS bundles (
    id UUID PRIMARY KEY,
    store VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    image_url TEXT,
    ends_at TIMESTAMP,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store, external_id)
  );

  -- Create Items Table
  CREATE TABLE IF NOT EXISTS bundle_items (
    id UUID PRIMARY KEY,
    bundle_id UUID REFERENCES bundles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT,
    image_url TEXT
  );

  -- Create Channels Table (for Discord notifications)
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    platforms TEXT[] DEFAULT '{humble,fanatical,gmg}'
  );
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