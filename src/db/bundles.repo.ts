import { pool } from "./index";
import { ParsedBundle } from "../types/bundle";
import { randomUUID } from "crypto";

export async function bundleExists(store: string, externalId: string, type: string = "bundles"): Promise<boolean> {
  let table = "bundles";
  if (type === "choice") table = "choice";
  else if (type === "book") table = "bookBundles";

  const res = await pool.query(
    `SELECT 1 FROM ${table} WHERE store = $1 AND external_id = $2`,
    [store, externalId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function insertBundle(bundle: ParsedBundle) {
  let table = "bundles";
  if (bundle.isChoice) table = "choice";
  else if (bundle.type === "book") table = "bookBundles";

  await pool.query(
    `INSERT INTO ${table} (id, store, external_id, name, url, image_url, ends_at, items, tiers, raw_data, thread_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]'::jsonb)`,
    [
      randomUUID(),
      bundle.store,
      bundle.externalId,
      bundle.name,
      bundle.url,
      bundle.imageUrl,
      bundle.endsAt,
      JSON.stringify(bundle.items),
      JSON.stringify(bundle.tiers),
      JSON.stringify(bundle.rawData),
    ]
  );
}

export async function insertChoice(bundle: ParsedBundle) {
  await pool.query(
    `INSERT INTO choice (id, store, external_id, name, url, image_url, ends_at, items, tiers, raw_data, thread_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]'::jsonb)`,
    [
      randomUUID(),
      bundle.store,
      bundle.externalId,
      bundle.name,
      bundle.url,
      bundle.imageUrl,
      bundle.endsAt,
      JSON.stringify(bundle.items),
      JSON.stringify(bundle.tiers),
      JSON.stringify(bundle.rawData),
    ]
  );
}

export async function lookupImpactLink(store: string, externalId: string, isChoice: boolean = false, isBooks: boolean = false): Promise<boolean> {
  const res = await pool.query(
    "SELECT 1 FROM impact_links WHERE store = $1 AND external_id = $2 AND isChoice = $3 AND isBooks = $4",
    [store, externalId, isChoice, isBooks]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getImpactLink(store: string, externalId: string, isChoice: boolean = false, isBooks: boolean = false): Promise<string | null> {
  const res = await pool.query(
    "SELECT link FROM impact_links WHERE store = $1 AND external_id = $2 AND isChoice = $3 AND isBooks = $4",
    [store, externalId, isChoice, isBooks]
  );
  return (res.rowCount ?? 0) > 0 ? res.rows[0].link : null;
}

export async function insertImpactLink(externalId: string, link: string, store: string, isChoice: boolean = false, isBooks: boolean = false) {
  await pool.query(
    `INSERT INTO impact_links (external_id, link, store, isChoice, isBooks) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (external_id) DO UPDATE SET link = $2`,
    [externalId, link, store, isChoice, isBooks]
  );
}

export async function getBundle(store: string, externalId: string): Promise<ParsedBundle | null> {
  // Try bundles table
  let res = await pool.query(
    `SELECT *, false as is_choice FROM bundles WHERE store = $1 AND external_id = $2`,
    [store, externalId]
  );

  // If not found and store is humble, try choice table
  if ((res.rowCount ?? 0) === 0 && store === 'humble') {
    res = await pool.query(
      `SELECT *, true as is_choice FROM choice WHERE store = $1 AND external_id = $2`,
      [store, externalId]
    );
  }

  if ((res.rowCount ?? 0) === 0 && store === 'humble') {
    res = await pool.query(
      `SELECT *, false as is_choice, 'book' as type FROM bookBundles WHERE store = $1 AND external_id = $2`,
      [store, externalId]
    );
  }

  if ((res.rowCount ?? 0) === 0) return null;

  const row = res.rows[0];
  return {
    store: row.store,
    externalId: row.external_id,
    slug: row.slug,
    type: row.type,
    name: row.name,
    url: row.url,
    imageUrl: row.image_url,
    endsAt: row.ends_at ? new Date(row.ends_at) : undefined,
    items: row.items,
    tiers: row.tiers,
    rawData: row.raw_data,
    isChoice: row.is_choice,
    threadId: row.thread_id
  };
}

export async function getBundleThreadId(store: string, externalId: string): Promise<string[] | null> {
  let res = await pool.query(`SELECT thread_id FROM bundles WHERE store = $1 AND external_id = $2`, [store, externalId]);
  if ((res.rowCount ?? 0) > 0) return res.rows[0].thread_id;

  if (store === 'humble') {
      res = await pool.query(`SELECT thread_id FROM choice WHERE store = $1 AND external_id = $2`, [store, externalId]);
      if ((res.rowCount ?? 0) > 0) return res.rows[0].thread_id;

      res = await pool.query(`SELECT thread_id FROM bookBundles WHERE store = $1 AND external_id = $2`, [store, externalId]);
      if ((res.rowCount ?? 0) > 0) return res.rows[0].thread_id;
  }
  return null;
}

// discord
export async function getChannel(channelId: string) {
  const res = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId]);
  return res.rows[0];
}

export async function getSubscribedChannels(platform: string): Promise<Array<{id: string}>> {
  const res = await pool.query(
    `SELECT id FROM channels WHERE $1 = ANY(platforms)`,
    [platform]
  );
  return res.rows.map(r => ({ id: r.id }));
}

export async function upsertChannel(channelId: string, guildId: string, platforms: string[]) {
  await pool.query(
    `INSERT INTO channels (id, guild_id, platforms) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET platforms = $3`,
    [channelId, guildId, platforms]
  );
}

export async function removeChannel(channelId: string) {
  await pool.query(`DELETE FROM channels WHERE id = $1`, [channelId]);
}

export async function updateBundleThreadId(store: string, externalId: string, threadId: string) {
  // Helper to append threadId safely without duplicates
  const appendQuery = `
    UPDATE bundles 
    SET thread_id = (
      CASE 
        WHEN thread_id IS NULL THEN '[]'::jsonb 
        WHEN NOT (thread_id @> to_jsonb($3::text)) THEN thread_id || to_jsonb($3::text)
        ELSE thread_id 
      END
    )
    WHERE store = $1 AND external_id = $2
  `;
  
  await pool.query(appendQuery, [store, externalId, threadId]);
  
  if (store === 'humble') {
      const appendChoice = appendQuery.replace('bundles', 'choice');
      await pool.query(appendChoice, [store, externalId, threadId]);
      
      const appendBooks = appendQuery.replace('bundles', 'bookBundles');
      await pool.query(appendBooks, [store, externalId, threadId]);
  }
}

export async function getExpiringBundles(hours: number): Promise<Array<{store: string, externalId: string, name: string, threadId: string[]}>> {
    const query = `
        SELECT store, external_id as "externalId", name, thread_id as "threadId" 
        FROM bundles 
        WHERE ends_at < NOW() + ($1 * INTERVAL '1 hour')
        AND ends_at > NOW()
        AND (reminded = FALSE OR reminded IS NULL)
        AND thread_id IS NOT NULL
        AND thread_id != '[]'::jsonb
        AND store = 'humble'
        UNION ALL
        SELECT store, external_id as "externalId", name, thread_id as "threadId" 
        FROM choice 
        WHERE ends_at < NOW() + ($1 * INTERVAL '1 hour')
        AND ends_at > NOW()
        AND (reminded = FALSE OR reminded IS NULL)
        AND thread_id IS NOT NULL
        AND thread_id != '[]'::jsonb
        AND store = 'humble'
        UNION ALL
        SELECT store, external_id as "externalId", name, thread_id as "threadId" 
        FROM bookBundles 
        WHERE ends_at < NOW() + ($1 * INTERVAL '1 hour')
        AND ends_at > NOW()
        AND (reminded = FALSE OR reminded IS NULL)
        AND thread_id IS NOT NULL
        AND thread_id != '[]'::jsonb
        AND store = 'humble'
    `;
    
    const res = await pool.query(query, [hours]);
    return res.rows;
}

export async function markBundleReminded(store: string, externalId: string) {
    const promises = [pool.query(`UPDATE bundles SET reminded = TRUE WHERE store = $1 AND external_id = $2`, [store, externalId])];
    if (store === 'humble') {
        promises.push(pool.query(`UPDATE choice SET reminded = TRUE WHERE store = $1 AND external_id = $2`, [store, externalId]));
        promises.push(pool.query(`UPDATE bookBundles SET reminded = TRUE WHERE store = $1 AND external_id = $2`, [store, externalId]));
    }
    await Promise.all(promises);
}

export async function upsertReminderConfig(guildId: string, roleId?: string, channelId?: string) {
    await pool.query(
        `INSERT INTO guild_configs (guild_id, reminder_role_id, reminder_channel_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id) DO UPDATE SET reminder_role_id = $2, reminder_channel_id = $3`,
        [guildId, roleId, channelId]
    );
}

export async function getReminderConfig(guildId: string) {
    const res = await pool.query(`SELECT reminder_role_id as "roleId", reminder_channel_id as "channelId" FROM guild_configs WHERE guild_id = $1`, [guildId]);
    return res.rows[0] || null;
}

export async function updateBundleEndsAt(store: string, externalId: string, endsAt: Date) {
  await pool.query(`UPDATE bundles SET ends_at = $3, reminded = false WHERE store = $1 AND external_id = $2`, [store, externalId, endsAt]);
  if (store === 'humble') {
      await pool.query(`UPDATE choice SET ends_at = $3, reminded = false WHERE store = $1 AND external_id = $2`, [store, externalId, endsAt]);
      await pool.query(`UPDATE bookBundles SET ends_at = $3, reminded = false WHERE store = $1 AND external_id = $2`, [store, externalId, endsAt]);
  }
}