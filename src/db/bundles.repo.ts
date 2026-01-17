import { pool } from "./index";
import { ParsedBundle } from "../types/bundle";
import { randomUUID } from "crypto";

export async function bundleExists(
  store: string,
  externalId: string
) {
  const res = await pool.query(
    `SELECT 1 FROM bundles WHERE store = $1 AND external_id = $2`,
    [store, externalId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function insertBundle(bundle: ParsedBundle) {
  const bundleId = randomUUID();

  // add fallbacks for name and url
  const safeName = bundle.name || bundle.slug || "Unknown Bundle";
  const safeUrl = bundle.url || `https://www.humblebundle.com/games/${bundle.externalId}`;

  await pool.query(
    `
    INSERT INTO bundles (
      id, store, external_id, name, url, image_url, ends_at, raw_data
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      bundleId,
      bundle.store,
      bundle.externalId,
      safeName, // Use the safe name
      safeUrl,  // Use the safe URL
      bundle.imageUrl || null,
      bundle.endsAt || null,
      bundle.rawData || {},
    ]
  );

  for (const item of bundle.items) {
    await pool.query(
      `
      INSERT INTO bundle_items (id, bundle_id, name, url, image_url)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        randomUUID(),
        bundleId,
        item.name,
        item.url,
        item.imageUrl,
      ]
    );
  }

  return bundleId;
}

export async function getBundle(store: string, externalId: string): Promise<ParsedBundle | null> {
  const bundleRes = await pool.query(
    `SELECT * FROM bundles WHERE store = $1 AND (external_id = $2 OR slug = $2)`,
    [store, externalId]
  );

  if (bundleRes.rowCount === 0) return null;
  const bundle = bundleRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT name, url, image_url as "imageUrl" FROM bundle_items WHERE bundle_id = $1`,
    [bundle.id]
  );

  return {
    ...bundle,
    imageUrl: bundle.image_url,
    externalId: bundle.external_id,
    items: itemsRes.rows,
    tiers: []
  };
}

export async function upsertChannel(channelId: string, guildId: string, platforms: string[]) {
  await pool.query(
    `INSERT INTO channels (id, guild_id, platforms) 
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET platforms = $3`,
    [channelId, guildId, platforms]
  );
}

export async function removeChannel(channelId: string) {
  await pool.query(`DELETE FROM channels WHERE id = $1`, [channelId]);
}

export async function getSubscribedChannels(platform: string) {
  const res = await pool.query(
    `SELECT id FROM channels WHERE $1 = ANY(platforms)`,
    [platform]
  );
  return res.rows.map(r => r.id);
}

export async function insertImpactLink(bundleExternalId: string, impactLink: string, bundleStore: string) {
  await pool.query(
    `
    INSERT INTO impact_links (external_id, link, store)
    VALUES ($1, $2, $3)
    `,
    [bundleExternalId, impactLink, bundleStore]
  );
}

export async function lookupImpactLink(
  store: string,
  externalId: string
) {
  const res = await pool.query(
    `SELECT 1 FROM impact_links WHERE store = $1 AND external_id = $2`,
    [store, externalId]
  );
  return (res.rowCount ?? 0) > 0;
}