import fetch from "node-fetch";
import { parseGmgBundlesListing } from "../parsers/gmg.parser";
import { bundleExists, insertBundle } from "../db/bundles.repo";
import { client } from "../discord/index";
import { notifyNewBundle } from "../discord/notifier";

export async function checkGmgBundles() {
  try {
    const res = await fetch("https://www.greenmangamingbundles.com/");
    const html = await res.text();

    const bundles = parseGmgBundlesListing(html);

    for (const b of bundles) {
      if (await bundleExists("gmg", b.externalId)) continue;

      await insertBundle(b);
      console.log(`[GMG] New Bundle: ${b.name}`);
      // Notify Discord
      await notifyNewBundle(b);
    }
  } catch (error) {
    console.error("[GMG] Error scraping:", error);
  }
}