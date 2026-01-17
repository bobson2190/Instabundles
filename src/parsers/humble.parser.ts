import { ParsedBundle } from "../types/bundle";
import * as cheerio from "cheerio";

export function parseHumbleBundle(
  html: string,
  bundleUrl: string,
  machineName: string
): ParsedBundle | null {
  const $ = cheerio.load(html);

  // 1. Try to find the main JSON blob
  const scriptContent = $("#webpack-bundle-page-data").html() || 
                        $('script[type="application/json"]').html();
  
  if (!scriptContent) return null;

  try {
    const data = JSON.parse(scriptContent);
    // Deep search for bundleData
    const bundleData = data.bundleData || 
                       data?.props?.pageProps?.bundleData || 
                       data?.componentProps?.bundleData;

    if (!bundleData) return null;
    const basicData = bundleData.basic_data || {};

    // --- NAME & IMAGE FIXES ---
    const name = basicData.human_name || bundleData.page_title || machineName;
    
    // Humble hides images in many places. Check them all.
    const imageUrl = 
        bundleData.high_res_tile_image || // Best
        bundleData.tile_image ||          // Common
        bundleData.standard_box_art ||    // Older bundles
        bundleData.header_image_url ||    // Alternate
        $('meta[property="og:image"]').attr('content'); // Fallback to meta tag

    // date
    const endsAt = basicData["end_time|datetime"] ? new Date(basicData["end_time|datetime"]) : undefined;

    // --- ITEM PARSING & CHARITY FILTER ---
    let rawItems: any[] = [];
    if (bundleData.tier_item_data) {
        rawItems = Object.values(bundleData.tier_item_data);
    }

    const items = rawItems
      .filter((item: any) => {
          const n = (item.human_name || "").toLowerCase();
          const m = (item.machine_name || "").toLowerCase();
            return n !== "" && n !== "coupon" && item.item_content_type == "game" && !n.includes("off") && !n.includes("discount");
      })
      .map((item: any) => ({
        name: item.human_name || item.machine_name,
        imageUrl: item.featured_image_url || "",
        externalId: item.machine_name,
        url: /* item.machine_name ? `https://www.humblebundle.com/store/${item.machine_name}` : */ undefined,
        storeUrl: "https://www.humblebundle.com/store/" + item.human_name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-"),
      }));

    // --- TIER FIX ("Tier 1", "Tier 2") ---
    const tiers: any[] = [];
    if (bundleData.tier_pricing_data) {
       for (const tierKey in bundleData.tier_pricing_data) {
          const tierInfo = bundleData.tier_pricing_data[tierKey];
          const priceArray: Array<{currency: string, amount: number}> = [];
          
          if(tierInfo['price|money']) {
               // Humble uses standard floats (e.g. 1.00, 15.00), no need to divide
               priceArray.push({
                   currency: tierInfo['price|money'].currency,
                   amount: tierInfo['price|money'].amount
               });
          }
          tiers.push({ quantity: 0, price: priceArray }); // Quantity is placeholder
       }
    }

    // SORT Tiers by Price (Ascending) to label them "Tier 1", "Tier 2"...
    tiers.sort((a, b) => (a.price[0]?.amount || 0) - (b.price[0]?.amount || 0));

    // Assign "Tier 1", "Tier 2" labels via the quantity field hack or just rely on order
    // We will inject the logic into the NOTIFIER to handle "Tier 1" vs "Tier 2" automatically
    // But here we can guess quantity if needed. For now, we trust the Notifier's "Tier X" logic below.

    return {
      store: "humble",
      externalId: machineName,
      slug: machineName,
      type: "game",
      name: name,
      url: bundleUrl,
      imageUrl: imageUrl,
      endsAt: endsAt,
      items: items,
      tiers: tiers,
      rawData: { machine_name: machineName }
    };
  } catch (e) {
    console.error(`[Humble Parser] Error parsing ${machineName}`, e);
    return null;
  }
}