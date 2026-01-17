import * as cheerio from "cheerio";
import { ParsedBundle, ParsedBundleItem } from "../types/bundle";

export function parseGmgBundlesListing(html: string): ParsedBundle[] {
  const $ = cheerio.load(html);
  const bundles: ParsedBundle[] = [];

  // GMG uses .hero-bundle classes for the main featured bundles
  $(".hero-bundle").each((_, el) => {
    const $el = $(el);
    
    // 1. Title
    const name = $el.find(".hero-title").text().trim();
    if (!name) return;

    // 2. URL and Slug
    // The link is usually on an anchor wrapping the button or image
    const linkHref = $el.find("a").attr("href"); 
    if (!linkHref) return;

    // Slug is the last part of /bundles/indie-adventures/
    const slug = linkHref.split("/").filter(Boolean).pop() || "";
    const fullUrl = `https://www.greenmangamingbundles.com${linkHref}`;

    // 3. Image
    const imageUrl = $el.find("img.hero-image").attr("src");

    // 4. Items (Images in the list usually have alt text with game names)
    const items: ParsedBundleItem[] = $el.find(".hero-games-list li img").map((_, img) => {
        return {
            name: $(img).attr("alt") || "Unknown Game",
            imageUrl: $(img).attr("src")
        };
    }).get();

    bundles.push({
        store: "gmg",
        externalId: slug, // Using slug as ID for GMG
        slug: slug,
        type: "game",
        name: name,
        url: fullUrl,
        imageUrl: imageUrl,
        items: items,
        tiers: [], // GMG listing page often doesn't show detailed tier pricing structure
        rawData: {}
    });
  });

  return bundles;
}