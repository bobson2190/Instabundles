import fetch from "node-fetch";
import { parseFanaticalBundle } from "../parsers/fanatical.parser";
import { bundleExists, insertBundle } from "../db/bundles.repo";
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
      
      if (await bundleExists("fanatical", b._id)) continue;

      const parsed = parseFanaticalBundle(
        b._id, b.slug, b.name, b.cover_image, b.type, b.sku, b.tiers, b.products, b.valid_until
      );

      await insertBundle(parsed);
      console.log(`[Fanatical] New Bundle: ${parsed.name}`);
      // Notify Discord
      await notifyNewBundle(parsed);
    }
  } catch (error) {
    console.error("[Fanatical] Error scraping:", error);
  }
}