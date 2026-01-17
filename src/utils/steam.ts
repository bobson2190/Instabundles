// src/utils/steam.ts
import fetch from "node-fetch";

interface SteamSearchResponse {
  items: Array<{
    id: number;
    name: string;
    tiny_image: string;
  }>;
  total: number;
}

export async function getSteamLink(gameName: string): Promise<string | null> {
  try {
    // Basic cleanup to improve search hit rate
    const cleanName = gameName
      .replace(/ - .*/, "") // Remove suffixes like " - Standard Edition"
      .replace(/[^\w\s]/gi, ""); // Remove special chars

    const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
      cleanName
    )}&l=english&cc=US`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as SteamSearchResponse;

    if (data.items && data.items.length > 0) {
      // Return the URL for the top result
      return `https://store.steampowered.com/app/${data.items[0].id}`;
    }

    return null;
  } catch (error) {
    console.error(`Error looking up Steam game ${gameName}:`, error);
    return null;
  }
}