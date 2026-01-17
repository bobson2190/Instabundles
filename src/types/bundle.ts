export interface ParsedBundle {
  store: "humble" | "fanatical" | "gmg";
  externalId: string;
  slug: string;
  type: "game" | "book" | "elearning" | "unidentified";

  name: string;
  url: string;
  imageUrl?: string;

  startsAt?: Date;
  endsAt?: Date;

  items: ParsedBundleItem[];
  tiers: Array<{
      quantity?: number;
      price: Array<{ currency: string; amount: number}>
    }>;

  rawData: unknown; // full payload
}

export interface ParsedBundleItem {
  externalId?: string;
  name: string;
  url?: string;
  imageUrl?: string;
  storeUrl?: string;
}
