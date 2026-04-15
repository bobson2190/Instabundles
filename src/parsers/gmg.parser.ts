import * as cheerio from "cheerio";
import { ParsedBundle, ParsedBundleItem } from "../types/bundle";

const BUNDLE_PATH_RE = /\/bundle(?:s)?\//i;

function normalizeUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  return rawUrl.trim().replace(/^view-source:/i, "");
}

function extractSlug(href: string): string | undefined {
  const normalizedHref = normalizeUrl(href) || href;
  try {
    const url = new URL(normalizedHref, "https://www.greenmangaming.com");
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 0 ? undefined : parts.pop();
  } catch {
    const parts = normalizedHref.split("/").filter(Boolean);
    return parts.length === 0 ? undefined : parts.pop();
  }
}

function isBundleHref(href: string): boolean {
  if (!href) return false;
  const normalized = normalizeUrl(href) || href;
  try {
    const url = new URL(normalized, "https://www.greenmangaming.com");
    return BUNDLE_PATH_RE.test(url.pathname);
  } catch {
    return BUNDLE_PATH_RE.test(normalized);
  }
}

export function parseGmgBundlesListing(html: string): ParsedBundle[] {
  const $ = cheerio.load(html);
  const bundles: ParsedBundle[] = [];
  const seenSlugs = new Set<string>();

  // --- New Parser Logic (for modern card-based layouts) ---
  $(".product-tile, .algolia-hit, .bundle-card").each((_, el) => {
    const $el = $(el);

    const linkEl = $el.find("a").first();
    const linkHref = normalizeUrl(linkEl.attr("href"));

    let name = $el.find(".product-tile-title, .hit-title, .bundle-card__title, h3, h4").first().text().trim();
    if (!name) {
      name = $el.find("img").attr("alt")?.trim() || "";
    }

    // Basic validation to filter out non-bundle items
    if (!linkHref || (!isBundleHref(linkHref) && !name.toLowerCase().includes("bundle"))) {
        return;
    }

    if (!name) return;

    const slug = extractSlug(linkHref);
    if (!slug || seenSlugs.has(slug)) return;

    const img = $el.find("img").first();
    // Check for data-src for lazy-loaded images
    const imageUrl = normalizeUrl(img.attr("data-src") || img.attr("src"));

    bundles.push({
      store: "gmg",
      isChoice: false,
      externalId: slug,
      slug: slug,
      type: "game",
      name: name,
      url: new URL(linkHref, "https://www.greenmangaming.com").toString(),
      imageUrl: imageUrl,
      items: [], // Items are not on the listing page in this layout
      tiers: [],
      rawData: {},
    });
    seenSlugs.add(slug);
  });

  // --- New GMG bundles listing layout ---
  $(".new-bundles .product-card:not(.expired):not(.hero-packshot), .product-card:not(.expired):not(.hero-packshot)").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find("a.cta-button[href], a[href*='/bundles/'], a[href*='/bundle/']").first();
    const linkHref = normalizeUrl(linkEl.attr("href"));
    if (!linkHref || !isBundleHref(linkHref)) return;

    const name = $el
      .find(".product-title, .bundle-card__title, .hero-title, h3, h4")
      .first()
      .text()
      .trim() || $el.find("img[alt]").attr("alt")?.trim() || "";
    if (!name) return;

    const slug = extractSlug(linkHref);
    if (!slug || seenSlugs.has(slug)) return;

    const img = $el.find(".product-image-front img, .product-image-back img, img").first();
    const imageUrl = normalizeUrl(img.attr("data-src") || img.attr("src"));

    const items: ParsedBundleItem[] = $el
      .find(
        ".modal-games-grid img, .hero-games-grid img, .product-items img, .game-thumbnail, .bundle-items img"
      )
      .map((_, itemImg) => ({
        name: $(itemImg).attr("alt")?.trim() || "Unknown Game",
        imageUrl: normalizeUrl($(itemImg).attr("data-src") || $(itemImg).attr("src")),
      }))
      .get();

    bundles.push({
      store: "gmg",
      isChoice: false,
      externalId: slug,
      slug,
      type: "game",
      name,
      url: new URL(linkHref, "https://www.greenmangaming.com").toString(),
      imageUrl,
      items,
      tiers: [],
      rawData: {},
    });
    seenSlugs.add(slug);
  });

  // --- Old Parser Logic (for hero-bundle layout) ---
  // This runs regardless, and we deduplicate by slug.
  $(".hero-bundle").each((_, el) => {
    const $el = $(el);
    const name = $el.find(".hero-title").text().trim();
    if (!name) return;
    const linkHref = $el.find("a").attr("href");
    if (!linkHref) return;
    const slug = linkHref.split("/").filter(Boolean).pop();
    if (!slug || seenSlugs.has(slug)) return;
    const imageUrl = $el.find("img.hero-image").attr("src");
    const items: ParsedBundleItem[] = $el
      .find(".hero-games-list li img")
      .map((_, img) => ({
        name: $(img).attr("alt") || "Unknown Game",
        imageUrl: $(img).attr("src"),
      }))
      .get();
    bundles.push({ store: "gmg", isChoice: false, externalId: slug, slug, type: "game", name, url: new URL(linkHref, "https://www.greenmangaming.com").toString(), imageUrl, items, tiers: [], rawData: {} });
    seenSlugs.add(slug);
  });

  return bundles;
}