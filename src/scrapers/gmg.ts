import fetch from "node-fetch";
import { parseGmgBundlesListing } from "../parsers/gmg.parser";
import { getBundle, getBundleThreadId, insertBundle, insertImpactLink, getImpactLink } from "../db/bundles.repo";
import { getSteamLink } from "../utils/steam";
import { generateImpactLink } from "../utils/impact";
import { client } from "../discord/index";
import { notifyNewBundle } from "../discord/notifier";

export async function checkGmgBundles() {
  try {
    const res = await fetch("https://greenmangaming.com/bundles");
    const html = await res.text();

    const bundles = parseGmgBundlesListing(html);

    for (const b of bundles) {
      const storedBundle = await getBundle("gmg", b.externalId);
      if (storedBundle) {
        const threadIds = await getBundleThreadId("gmg", b.externalId);
        if (!threadIds || threadIds.length === 0) {
          console.log(`[GMG] Backfilling thread_id for ${b.name}`);
          await notifyNewBundle(b);
        }
        continue;
      }

      await Promise.all(b.items.map(async (item) => {
        const steamUrl = await getSteamLink(item.name);
        if (steamUrl) item.url = steamUrl;
      }));

      await insertBundle(b);
      console.log(`[GMG] New Bundle: ${b.name}`);

      let impactLink = await getImpactLink("gmg", b.externalId);
      if (!impactLink) {
        impactLink = await generateImpactLink("gmg", b.url, b.externalId);
        if (impactLink) await insertImpactLink(b.externalId, impactLink, "gmg", false);
      }

      // Notify Discord
      await notifyNewBundle(b);
    }
  } catch (error) {
    console.error("[GMG] Error scraping:", error);
  }
}