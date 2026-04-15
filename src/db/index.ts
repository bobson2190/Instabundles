import pg from "pg";

let url = process.env.DATABASE_URL;

if (process.argv.includes('--test')) { url = process.env.TEST_DATABASE_URL; }

export const pool = new pg.Pool({
  connectionString: url,
});
