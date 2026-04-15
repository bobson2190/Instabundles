import fetch from "node-fetch";
import { parseHumbleBundle, parseHumbleChoice, parseHumbleBooks } from "../parsers/humble.parser";
import { bundleExists, insertBundle, insertChoice, insertImpactLink, getImpactLink, getBundleThreadId, getBundle, updateBundleEndsAt } from "../db/bundles.repo";
import { getSteamLink } from "../utils/steam";
import { generateImpactLink } from "../utils/impact";
import { notifyNewBundle, notifyExtension } from "../discord/notifier";
import * as cheerio from "cheerio";

let isTestMode = process.argv.includes('--test');

export async function checkHumbleChoice(verbose: boolean = false) {
  try {
    //const res = await fetch("https://www.humblebundle.com/membership/home");
    //const html = await res.text();
    const parsed = await parseHumbleChoice();

    if (parsed) {
      const storedBundle = await getBundle("humble", parsed.externalId);
      if (storedBundle) {
        const threadIds = await getBundleThreadId("humble", parsed.externalId);
        if (!threadIds || threadIds.length === 0) {
             console.log(`[Humble] Backfilling thread_id for ${parsed.name}`);
             await notifyNewBundle(parsed);
        }
        if (verbose) console.log(`[Humble] Choice bundle "${parsed.name}" already exists/processed.`);
        return;
      }

      await Promise.all(parsed.items.map(async (item) => {
        const steamUrl = await getSteamLink(item.name);
        if (steamUrl) item.url = steamUrl;
      }));

      await insertChoice(parsed);
      console.log(`[Humble] New Choice Bundle: ${parsed.name}`);

      // Generate Impact Link
      const nameParts = parsed.name.split(' ');
      let customPath = "";
      if (nameParts.length >= 2 && /^\d{4}$/.test(nameParts[1])) {
        const month = nameParts[0].toLowerCase();
        const year = nameParts[1];
        customPath = `dsc_${month}-${year}Choice`;
      } else {
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const year = now.getFullYear();
        customPath = `dsc_${month}${year}Choice`;
      }
      console.log(parsed.externalId, customPath, parsed.url)
      
      let impactLink = await getImpactLink("humble", parsed.externalId, true);
      if (!impactLink) {
        impactLink = await generateImpactLink("humble", parsed.url, parsed.externalId, customPath);
        if (impactLink) await insertImpactLink(parsed.externalId, impactLink, "humble", true);
      }
      if (impactLink) parsed.url = impactLink;

      // Notify Discord
      await notifyNewBundle(parsed);
    }
  } catch (error) {
    console.error("[Humble] Error scraping Choice:", error);
  }
}

export async function checkHumbleBundles() {
  try {
    const res = await fetch("https://www.humblebundle.com/client/bundles");
    const bundles = await res.json() as any[];

    for (const b of bundles) {
      const storedBundle = await getBundle("humble", b.bundle_machine_name);

      const html = await fetch(b.url).then(r => r.text());
      const parsed = parseHumbleBundle(html, b.url, b.bundle_machine_name);

      if (parsed) {

        if (storedBundle) {
             // Only check for extension if the stored bundle has already expired (or is in the past)
             if (parsed.endsAt && storedBundle.endsAt && 
                 storedBundle.endsAt.getTime() < Date.now() && 
                 parsed.endsAt.getTime() > storedBundle.endsAt.getTime() + 1000 * 60 * 60) {
                 
                 console.log(`[Humble] Bundle Extended: ${parsed.name}`);
                 await updateBundleEndsAt("humble", parsed.externalId, parsed.endsAt);
                 await notifyExtension(parsed, storedBundle.endsAt);
             }
             const threadIds = await getBundleThreadId("humble", parsed.externalId);
             if (!threadIds || threadIds.length === 0) {
                 await notifyNewBundle(parsed);
             }
             continue;
        } else {
             await insertBundle(parsed);
        }

        await Promise.all(parsed.items.map(async (item) => {
            const steamUrl = await getSteamLink(item.name);
            if (steamUrl) item.url = steamUrl;
        }));
        
        console.log(`[Humble] New Bundle: ${parsed.name}`);

        let impactLink = await getImpactLink("humble", parsed.externalId);
        if (!impactLink && !isTestMode) { 
          impactLink = await generateImpactLink("humble", parsed.url, parsed.externalId); 
          if (impactLink && impactLink.length > 0) await insertImpactLink(parsed.externalId, impactLink, "humble", false);
        }
        if (impactLink) parsed.url = impactLink;

        // Notify Discord
        await notifyNewBundle(parsed);
      }
    }
  } catch (error) {
    console.error("[Humble] Error scraping:", error);
  }
}

export async function checkHumbleBooks() {
  try {
    const res = await fetch("https://www.humblebundle.com/books");
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // 1. Try to find the main JSON blob
    const scriptContent = $("#landingPage-json-data").html() || 
                          $("#webpack-bundle-page-data").html() || 
                          $('script[type="application/json"]').html();

    if (!scriptContent) {
      console.log("[Humble Books] Could not find JSON data script content.");
      return;
    }

    const data = JSON.parse(scriptContent);
    const products = data?.data?.books?.mosaic?.[0]?.products || [];

    for (const b of products) {
      const storedBundle = await getBundle("humble", b.machine_name);

      const bundleUrl = `https://www.humblebundle.com${b.product_url.startsWith('/') ? '' : '/'}${b.product_url}`;
      const bundleHtml = await fetch(bundleUrl).then(r => r.text());
      const parsed = parseHumbleBooks(bundleHtml, bundleUrl, b.machine_name);

      if (parsed) {
        if (storedBundle) {
             // Only check for extension if the stored bundle has already expired (or is in the past)
             if (parsed.endsAt && storedBundle.endsAt && 
                 storedBundle.endsAt.getTime() < Date.now() && 
                 parsed.endsAt.getTime() > storedBundle.endsAt.getTime() + 1000 * 60 * 60) {

                 console.log(`[Humble] Book Bundle Extended: ${parsed.name}`);
                 await updateBundleEndsAt("humble", parsed.externalId, parsed.endsAt);
                 await notifyExtension(parsed, storedBundle.endsAt);
             }
             const threadIds = await getBundleThreadId("humble", parsed.externalId);
             if (!threadIds || threadIds.length === 0) {
                 await notifyNewBundle(parsed);
             }
             continue;
        } else {
             await insertBundle(parsed);
        }
        console.log(`[Humble Books] New Bundle: ${parsed.name}`);

        let impactLink = await getImpactLink("humble", parsed.externalId, false, true);
        if (!impactLink && !isTestMode) { 
          impactLink = await generateImpactLink("humble", parsed.url, parsed.externalId); 
          if (impactLink && impactLink.length > 0) await insertImpactLink(parsed.externalId, impactLink, "humble", false, true);
        }
        if (impactLink) parsed.url = impactLink;

        // Notify Discord
        await notifyNewBundle(parsed);
      }
    }
  } catch (error) {
    console.error("[Humble] Error scraping:", error);
  }
}