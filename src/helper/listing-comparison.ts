export interface EbayItemSummary {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: Array<{
    shippingCostType?: string;
    shippingCost?: { value?: string; currency?: string };
  }>;
  condition?: string;
  seller?: { feedbackPercentage?: string; feedbackScore?: number };
  itemWebUrl?: string;
  buyingOptions?: string[];
}

export interface ComparedListing {
  itemId: string | null;
  title: string;
  condition: string | null;
  price: number;
  shipping: number | null;
  deliveredCost: number | null;
  currency: string;
  shippingStatus: "known" | "calculated_at_checkout" | "not_returned";
  seller: {
    feedbackPercentage: number | null;
    feedbackScore: number | null;
  };
  buyingOptions: string[];
  specs: {
    cpu: string[];
    memory: string[];
    storage: string[];
    networking: string[];
    power: string[];
  };
  itemUrl: string | null;
}

export interface BrowseSearchInput {
  query: string;
  limit: number;
  minPrice?: number;
  maxPrice?: number;
}

export function buildBrowseSearchParams(input: BrowseSearchInput): Record<string, string> {
  const filters = ["buyingOptions:{FIXED_PRICE}"];
  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    filters.push(`price:[${input.minPrice ?? ""}..${input.maxPrice ?? ""}]`, "priceCurrency:USD");
  }
  return {
    q: input.query,
    limit: String(input.limit),
    filter: filters.join(","),
  };
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  return [...new Set([...value.matchAll(pattern)].map(match => match[0].replace(/\s+/g, " ").trim()))];
}

function normalizeTitleTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function filterItemsByTitleTerms<T extends { title?: string }>(
  items: T[],
  mustInclude: string[] = [],
  mustExclude: string[] = [],
): T[] {
  const required = mustInclude.map(normalizeTitleTerm).filter(Boolean);
  const excluded = mustExclude.map(normalizeTitleTerm).filter(Boolean);
  return items.filter(item => {
    const title = normalizeTitleTerm(item.title ?? "");
    return required.every(term => title.includes(term)) && !excluded.some(term => title.includes(term));
  });
}

function extractSpecHints(title: string): ComparedListing["specs"] {
  return {
    cpu: uniqueMatches(title, /\bi[3579]-\d{4,5}[A-Za-z]{0,2}\b/gi),
    memory: uniqueMatches(title, /\b\d+\s*GB(?:\s+(?:DDR[345]|RAM))\b/gi),
    storage: uniqueMatches(title, /\b\d+(?:\.\d+)?\s*(?:TB|GB)\s+(?:NVMe|M\.2|SSD|HDD)\b/gi),
    networking: uniqueMatches(title, /\b(?:Wi-?Fi|Bluetooth|BT)\b/gi),
    power: uniqueMatches(title, /\b\d+\s*W\b/gi),
  };
}

function canonicalizeItemUrl(itemWebUrl: string | undefined): string | null {
  if (!itemWebUrl) return null;
  try {
    const url = new URL(itemWebUrl);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return itemWebUrl;
  }
}

function finiteNumber(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeListings(items: EbayItemSummary[]): ComparedListing[] {
  return items.flatMap((item): ComparedListing[] => {
    const price = finiteNumber(item.price?.value);
    if (price === null) return [];

    const shippingOption = item.shippingOptions?.[0];
    const shipping = finiteNumber(shippingOption?.shippingCost?.value);
    const shippingStatus = shipping !== null
      ? "known"
      : shippingOption?.shippingCostType === "CALCULATED"
        ? "calculated_at_checkout"
        : "not_returned";
    const feedbackPercentage = finiteNumber(item.seller?.feedbackPercentage);

    return [{
      itemId: item.itemId ?? null,
      title: item.title ?? "Untitled listing",
      condition: item.condition ?? null,
      price,
      shipping,
      deliveredCost: shipping === null ? null : price + shipping,
      currency: item.price?.currency ?? shippingOption?.shippingCost?.currency ?? "USD",
      shippingStatus,
      seller: {
        feedbackPercentage,
        feedbackScore: item.seller?.feedbackScore ?? null,
      },
      buyingOptions: item.buyingOptions ?? [],
      specs: extractSpecHints(item.title ?? ""),
      itemUrl: canonicalizeItemUrl(item.itemWebUrl),
    }];
  }).sort((left, right) => {
    if (left.deliveredCost === null && right.deliveredCost !== null) return 1;
    if (left.deliveredCost !== null && right.deliveredCost === null) return -1;
    return (left.deliveredCost ?? left.price) - (right.deliveredCost ?? right.price);
  });
}
