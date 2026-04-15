import fetch from "node-fetch";
import { parseFanaticalBundle } from "../parsers/fanatical.parser";
import { getBundle, getBundleThreadId, insertBundle } from "../db/bundles.repo";
import { getSteamLink } from "../utils/steam";
import { client } from "../discord/index";
import { notifyNewBundle } from "../discord/notifier";

interface FanaticalResponse {
    pickandmix: Array<{
        type: string;
        _id: string;
        slug: string;
        name: string;
        cover_image: string;
        sku: string;
        tiers: Array<{
          quantity: number;
          price: Record<string, number>;
        }>;
        products: Array<{
          _id: string;
          name: string;
          slug: string;
          cover_image: string;
        }>;
        valid_until: string;
    }>;
}

export async function checkFanaticalBundles() {
  try {
    const res = await fetch("https://fanatical.com/api/all");
    const json = await res.json() as FanaticalResponse;

    for (const b of json.pickandmix) {
      if (b.type !== "bundle") continue;
      
      const parsed = parseFanaticalBundle(
        b._id, b.slug, b.name, b.cover_image, b.type, b.sku, b.tiers, b.products, b.valid_until
      );

      const storedBundle = await getBundle("fanatical", parsed.externalId);
      if (storedBundle) {
        const threadIds = await getBundleThreadId("fanatical", parsed.externalId);
        if (!threadIds || threadIds.length === 0) {
          console.log(`[Fanatical] Backfilling thread_id for ${parsed.name}`);
          await notifyNewBundle(parsed);
        }
        continue;
      }

      await Promise.all(parsed.items.map(async (item) => {
        const steamUrl = await getSteamLink(item.name);
        if (steamUrl) item.url = steamUrl;
      }));

      await insertBundle(parsed);
      console.log(`[Fanatical] New Bundle: ${parsed.name}`);
      // Notify Discord
      await notifyNewBundle(parsed);
    }
  } catch (error) {
    console.error("[Fanatical] Error scraping:", error);
  }
}