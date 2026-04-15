import { ParsedBundle } from "../types/bundle";
import { getStoredCookie, saveCookie } from "../utils/cookie";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const vatRates: Record<string, number> = {
  EUR: 0.21,
  GBP: 0.20,
  USD: 0
}

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
    const exchangeRates = data.exchangeRates;
    const basicData = bundleData.basic_data || {};

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
    const rawItems = getSortedItems(bundleData);

    const items = rawItems
      .filter((item: any) => {
          const n = (item.human_name || "").toLowerCase();
          const m = (item.machine_name || "").toLowerCase();
          if (item.ppgf_info && Object.keys(item.ppgf_info).length > 0) { return false; }
            return n !== "" && n !== "coupon" && item.item_content_type == "game" && !n.includes("off") && !n.includes("discount");
      })
      .map((item: any) => ({
        name: item.human_name || item.machine_name,
        imageUrl: item.resolved_paths.featured_image || item.resolved_paths.front_page_art_imgix_retina || item.resolved_paths.front_page_art_charity_imgix_retina ||"",
        externalId: item.machine_name,
        url: /* item.machine_name ? `https://www.humblebundle.com/store/${item.machine_name}` : */ undefined,
        storeUrl: /* "https://www.humblebundle.com/store/" + item.human_name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-") */ undefined,
      }));

    const tiers: any[] = [];
    const tierPricingData = bundleData.tier_pricing_data || {};
    const tierDisplayData = bundleData.tier_display_data || {};
    
    // Use tier_order if available, otherwise keys from display data, otherwise pricing data
    let tierKeys = bundleData.tier_order;
    if (!tierKeys && Object.keys(tierDisplayData).length > 0) {
        tierKeys = Object.keys(tierDisplayData).sort((a: any, b: any) => {
             return (tierDisplayData[a].sort_order || 0) - (tierDisplayData[b].sort_order || 0);
        });
    }
    if (!tierKeys) {
        tierKeys = Object.keys(tierPricingData);
    }

    // Sort tierKeys by price ascending to ensure we process lowest tiers first for deduplication
    if (tierKeys && tierPricingData) {
        tierKeys.sort((a: string, b: string) => {
            const priceA = tierPricingData[a]?.['price|money']?.amount || 0;
            const priceB = tierPricingData[b]?.['price|money']?.amount || 0;
            return priceA - priceB;
        });
    }

    const seenExternalIds = new Set<string>();

    if (tierKeys && tierKeys.length > 0) {
       for (const tierKey of tierKeys) {
          const tierInfo = tierPricingData[tierKey];
          const displayInfo = tierDisplayData[tierKey];
          const priceArray: Array<{currency: string, amount: number}> = [];
          
          if(tierInfo) {
              const basePrice = tierInfo['price|money'];
              if (basePrice) {
                   priceArray.push({
                       currency: basePrice.currency,
                       amount: basePrice.amount
                   });

                   if (exchangeRates) {
                      const baseRate = exchangeRates[`${basePrice.currency}|decimal`];
                      const baseVat = vatRates[basePrice.currency] ?? 0;
                      const baseWithoutVat = basePrice.amount / (1 + baseVat);

                      if (baseRate && baseWithoutVat) {
                          ["USD", "GBP", "EUR"].forEach(target => {
                              if (target === basePrice.currency) return;
                              const targetRate = exchangeRates[`${target}|decimal`];
                              const targetVat = vatRates[target] ?? 0;

                              if (targetRate) {
                                  const convertedNoVat = (baseWithoutVat / baseRate) * targetRate;
                                  const finalAmount = convertedNoVat * (1 + targetVat);
                                  priceArray.push({ currency: target, amount: Number(finalAmount.toFixed(2)) });
                              }
                           });
                      }
                  }
            }
        }

          // Match items to this tier using the display data
          let tierItems: any[] = [];
          if (displayInfo) {
              const productList = displayInfo.products || displayInfo.tier_item_machine_names || [];
              
              tierItems = items.filter((i: any) => {
                  const isMatch = productList.includes(i.externalId);
                  if (isMatch && !seenExternalIds.has(i.externalId)) {
                      seenExternalIds.add(i.externalId);
                      return true;
                  }
                  return false;
              });
          }

          // Only add if we have price or items
          if (priceArray.length > 0 || tierItems.length > 0) {
            tiers.push({ 
                quantity: tierItems.length, 
                price: priceArray,
                items: tierItems,
                sortOrder: displayInfo?.sort_order || 0
            });
          }
       }
    }

    // SORT Tiers by Price (Ascending) to label them "Tier 1", "Tier 2"...
    tiers.sort((a, b) => {
        // Prefer sort_order if available
        if (a.sortOrder !== 0 || b.sortOrder !== 0) {
            return a.sortOrder - b.sortOrder;
        }
        return (a.price[0]?.amount || 0) - (b.price[0]?.amount || 0);
    });

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
      rawData: { machine_name: machineName },
      isChoice: false
    };
  } catch (e) {
    console.error(`[Humble Parser] Error parsing ${machineName}`, e);
    return null;
  }
}

export async function parseHumbleChoice(): Promise<ParsedBundle | null> {
  let currentCookie = getStoredCookie();

  const res = await fetch("https://www.humblebundle.com/membership/home", {
    headers: {
      "Cookie": `_simpleauth_sess=${currentCookie}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
  });

  // 2. Check if the server sent a new one
  const setCookieHeader = res.headers.get('set-cookie');
  if (setCookieHeader) {
    const match = setCookieHeader.match(/_simpleauth_sess=([^;]+)/);
    if (match) {
      const updatedCookie = match[1];
      // console.log("Session rotated. Saving new cookie to file...");
      saveCookie(updatedCookie);
      currentCookie = updatedCookie; // Use the new one for the rest of this run
    }
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const scriptContent = $("#webpack-subscriber-hub-data").html();
  
  if (!scriptContent) console.log("fuck you");
  if (!scriptContent) return null;

  try {
    const data = JSON.parse(scriptContent);
    const choiceOptions = data.contentChoiceOptions;
    const choiceData = choiceOptions?.contentChoiceData;

    if (!choiceData) return null;

    const machineName = choiceOptions.productMachineName;
    const title = choiceOptions.title; 
    const name = `Humble Choice - ${title}`;
    const slug = choiceOptions.productUrlPath;
    const url = `https://www.humblebundle.com/membership/${slug}`;

    // Image
    const imageRes = await fetch("https://www.humblebundle.com/membership", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    });
    if (!imageRes.ok) {
        throw new Error(`Failed to fetch page: ${imageRes.status}`);
    }
    const htmlContent = await imageRes.text();
    const $ = cheerio.load(htmlContent);
    const imageUrl = $('meta[property="og:image"]').attr('content');

    // Items
    const items = [];
    if (choiceData.game_data && choiceData.display_order) {
        for (const key of choiceData.display_order) {
            const game = choiceData.game_data[key];
            if (!game) continue;
            
            // Filter out coupons
            if (key.includes("coupon") || game.title.toLowerCase().includes("coupon")) {
                continue;
            }

            items.push({
                name: game.title,
                imageUrl: game.image,
                externalId: game.display_item_machine_name,
                url: undefined,
                storeUrl: "https://www.humblebundle.com/store/" + game.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-"),
            });
        }
    }

    // Tiers
    const tiers = [];
    const priceInfo = data["baseSubscriptionPrice|money"];
    if (priceInfo) {
        tiers.push({
            quantity: items.length,
            price: [{
                currency: priceInfo.currency,
                amount: priceInfo.amount
            }],
            items: items
        });
    }

    return {
      store: "humble",
      isChoice: true,
      externalId: machineName,
      slug: slug,
      type: "game",
      name: name,
      url: url,
      imageUrl: imageUrl || "",
      endsAt: undefined,
      items: items,
      tiers: tiers,
      rawData: { machine_name: machineName }
      
    };

  } catch (e) {
    console.error(`[Humble Choice Parser] Error parsing choice`, e);
    return null;
  }
}

export function parseHumbleBooks(
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
    const exchangeRates = data.exchangeRates;
    const basicData = bundleData.basic_data || {};

    const name = basicData.human_name || bundleData.page_title || machineName;
    
    // Humble hides images in many places. Check them all.
    const imageUrl = 
        basicData.logo || // Usual logo
        $('meta[property="og:image"]').attr('content'); // Fallback to meta tag

    // date
    const endsAt = basicData["end_time|datetime"] ? new Date(basicData["end_time|datetime"]) : undefined;

    // --- ITEM PARSING & CHARITY FILTER ---
    const rawItems = getSortedItems(bundleData);

    const items = rawItems
      .filter((item: any) => {
          const n = (item.human_name || "").toLowerCase();
          const m = (item.machine_name || "").toLowerCase();
          if (item.ppgf_info && Object.keys(item.ppgf_info).length > 0) { return false; }
            return n !== "" && n !== "coupon" && !n.includes("off") && !n.includes("discount");
      })
      .map((item: any) => ({
        name: item.human_name || item.machine_name,
        imageUrl: item.resolved_paths.featured_image || item.resolved_paths.front_page_art_imgix_retina || item.resolved_paths.front_page_art_charity_imgix_retina ||"",
        externalId: item.machine_name,
        url: /* item.machine_name ? `https://www.humblebundle.com/store/${item.machine_name}` : */ undefined,
        storeUrl: /* "https://www.humblebundle.com/store/" + item.human_name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-") */ undefined,
      }));

    const tiers: any[] = [];
    const tierPricingData = bundleData.tier_pricing_data || {};
    const tierDisplayData = bundleData.tier_display_data || {};
    
    // Use tier_order if available, otherwise keys from display data, otherwise pricing data
    let tierKeys = bundleData.tier_order;
    if (!tierKeys && Object.keys(tierDisplayData).length > 0) {
        tierKeys = Object.keys(tierDisplayData).sort((a: any, b: any) => {
             return (tierDisplayData[a].sort_order || 0) - (tierDisplayData[b].sort_order || 0);
        });
    }
    if (!tierKeys) {
        tierKeys = Object.keys(tierPricingData);
    }

    // Sort tierKeys by price ascending to ensure we process lowest tiers first for deduplication
    if (tierKeys && tierPricingData) {
        tierKeys.sort((a: string, b: string) => {
            const priceA = tierPricingData[a]?.['price|money']?.amount || 0;
            const priceB = tierPricingData[b]?.['price|money']?.amount || 0;
            return priceA - priceB;
        });
    }

    const seenExternalIds = new Set<string>();

    if (tierKeys && tierKeys.length > 0) {
       for (const tierKey of tierKeys) {
          const tierInfo = tierPricingData[tierKey];
          const displayInfo = tierDisplayData[tierKey];
          const priceArray: Array<{currency: string, amount: number}> = [];
          
          if(tierInfo) {
              const basePrice = tierInfo['price|money'];
              if (basePrice) {
                   priceArray.push({
                       currency: basePrice.currency,
                       amount: basePrice.amount
                   });

                   if (exchangeRates) {
                       const baseRate = exchangeRates[`${basePrice.currency}|decimal`];
                       const baseVat = vatRates[basePrice.currency] ?? 0;
                       const baseWithoutVat = basePrice.amount / (1 + baseVat);

                       if (baseRate && baseWithoutVat) {
                           ["USD", "GBP", "EUR"].forEach(target => {
                               if (target === basePrice.currency) return;
                               const targetRate = exchangeRates[`${target}|decimal`];
                               const targetVat = vatRates[target] ?? 0;

                               if (targetRate) {
                                   const convertedNoVat = (baseWithoutVat / baseRate) * targetRate;
                                   const finalAmount = convertedNoVat * (1 + targetVat);
                                   priceArray.push({ currency: target, amount: Number(finalAmount.toFixed(2)) });
                               }
                           });
                       }
                   }
              }
          }

          // Match items to this tier using the display data
          let tierItems: any[] = [];
          if (displayInfo) {
              const productList = displayInfo.products || displayInfo.tier_item_machine_names || [];
              
              tierItems = items.filter((i: any) => {
                  const isMatch = productList.includes(i.externalId);
                  if (isMatch && !seenExternalIds.has(i.externalId)) {
                      seenExternalIds.add(i.externalId);
                      return true;
                  }
                  return false;
              });
          }

          if (priceArray.length > 0 || tierItems.length > 0) {
            tiers.push({ 
                quantity: tierItems.length, 
                price: priceArray,
                items: tierItems,
                sortOrder: displayInfo?.sort_order || 0
            });
          }
       }
    }

    // SORT Tiers by Price (Ascending) to label them "Tier 1", "Tier 2"...
    tiers.sort((a, b) => {
        if (a.sortOrder !== 0 || b.sortOrder !== 0) {
            return a.sortOrder - b.sortOrder;
        }
        return (a.price[0]?.amount || 0) - (b.price[0]?.amount || 0);
    });

    // Assign "Tier 1", "Tier 2" labels via the quantity field hack or just rely on order
    // We will inject the logic into the NOTIFIER to handle "Tier 1" vs "Tier 2" automatically
    // But here we can guess quantity if needed. For now, we trust the Notifier's "Tier X" logic below.

    return {
      store: "humble",
      externalId: machineName,
      slug: machineName,
      type: "book",
      name: name,
      url: bundleUrl,
      imageUrl: imageUrl,
      endsAt: endsAt,
      items: items,
      tiers: tiers,
      rawData: { machine_name: machineName },
      isChoice: false
    };
  } catch (e) {
    console.error(`[Humble Parser] Error parsing ${machineName}`, e);
    return null;
  }
}

function getSortedItems(bundleData: any): any[] {
  const tierItemData = bundleData.tier_item_data || {};
  const tierDisplayData = bundleData.tier_display_data;
  const tierOrder = bundleData.tier_order;

  if (!tierDisplayData) {
    return Object.values(tierItemData);
  }

  let sortedTiers: any[] = [];
  if (tierOrder) {
      sortedTiers = tierOrder.map((key: string) => tierDisplayData[key]).filter((t: any) => t);
  } else {
      sortedTiers = Object.values(tierDisplayData).sort((a: any, b: any) => {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
  }

  const sortedItems: any[] = [];
  const seenMachineNames = new Set<string>();

  for (const tier of sortedTiers) {
    const products = (tier as any).products || (tier as any).tier_item_machine_names || [];
    for (const machineName of products) {
      if (seenMachineNames.has(machineName)) continue;
      
      const item = tierItemData[machineName];
      if (item) {
        sortedItems.push(item);
        seenMachineNames.add(machineName);
      }
    }
  }

  return sortedItems.length > 0 ? sortedItems : Object.values(tierItemData);
}