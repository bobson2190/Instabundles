import fetch from "node-fetch";
import { parseHumbleBundle } from "../parsers/humble.parser";
import { bundleExists, insertBundle } from "../db/bundles.repo";
import { client } from "../discord/index"; 
import { notifyNewBundle } from "../discord/notifier";

export async function checkHumbleBundles() {
  try {
    const res = await fetch("https://www.humblebundle.com/client/bundles");
    const bundles = await res.json() as any[];

    for (const b of bundles) {
      if (await bundleExists("humble", b.bundle_machine_name)) continue;

      const html = await fetch(b.url).then(r => r.text());
      const parsed = parseHumbleBundle(html, b.url, b.bundle_machine_name);

      if (parsed) {
        await insertBundle(parsed);
        console.log(`[Humble] New Bundle: ${parsed.name}`);
        // Notify Discord
        await notifyNewBundle(parsed);
      }
    }
  } catch (error) {
    console.error("[Humble] Error scraping:", error);
  }
}