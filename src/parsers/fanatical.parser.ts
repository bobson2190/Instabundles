import { val } from "cheerio/dist/commonjs/api/attributes";
import { ParsedBundle } from "../types/bundle";

export function parseFanaticalBundle(
    _id: string,
    slug: string,
    name: string,
    cover_image: string,
    type: string,
    sku: string,
    tiers: Array<{ quantity: number; price: any }> = [], 
    products: Array<{ _id: string; name: string; slug: string; cover?: string }> = [],
    valid_until: string
): ParsedBundle {

  const formattedTiers = (tiers || []).map(tier => {
    const prices = [];
    if (tier.price && typeof tier.price === 'object') {
        for (const [currency, amount] of Object.entries(tier.price)) {
            // FIX: Fanatical tiers are in cents/pennies (integer). Divide by 100.
            // Example: 495 -> 4.95
            prices.push({ currency, amount: Number(amount) / 100 });
        }
    }
    return {
        quantity: tier.quantity,
        price: prices
    };
  });

  // dedupe items by slug
  const seenSlugs = new Set<string>();
  const uniqueProducts = (products || []).filter(p => {
    if (seenSlugs.has(p.slug)) {
      return false; // skip duplicate
    }
    seenSlugs.add(p.slug);
    return true;
  });

  const safeProducts = uniqueProducts.map(p => ({
        externalId: p._id,
        name: p.name,
        url: `https://www.fanatical.com/en/game/${p.slug}`,
        imageUrl: p.cover ? `https://fanatical.imgix.net/product/original/${p.cover}` : undefined,
        storeUrl: `https://www.fanatical.com/en/game/${p.slug}`
  }));

  const endsAt = valid_until ? new Date(valid_until) : undefined;

  return {
    store: "fanatical",
    externalId: _id,
    slug: slug,
    type: "game",
    name: name || slug,
    imageUrl: cover_image ? `https://fanatical.imgix.net/product/original/${cover_image}` : undefined,
    url: `https://www.fanatical.com/en/pick-and-mix/${slug}`,
    items: safeProducts, 
    tiers: formattedTiers,
    endsAt: endsAt,
    rawData: { _id, sku, type }
  };
}