import { describe, expect, it } from "vitest";
import { buildBrowseSearchParams, filterItemsByTitleTerms, normalizeListings } from "./listing-comparison.js";

describe("buildBrowseSearchParams", () => {
  it("builds a bounded fixed-price search with an optional price range", () => {
    expect(buildBrowseSearchParams({
      query: "Dell OptiPlex Micro",
      limit: 12,
      minPrice: 100,
      maxPrice: 250,
    })).toEqual({
      q: "Dell OptiPlex Micro",
      limit: "12",
      filter: "buyingOptions:{FIXED_PRICE},price:[100..250],priceCurrency:USD",
    });
  });
});

describe("normalizeListings", () => {
  it("calculates delivered cost and extracts compact computer spec hints", () => {
    const result = normalizeListings([
      {
        itemId: "v1|123|0",
        title: "Dell OptiPlex 7060 Micro i5-8500T 16GB DDR4 256GB NVMe WiFi/BT 65W",
        price: { value: "181.50", currency: "USD" },
        shippingOptions: [{ shippingCost: { value: "12.00", currency: "USD" } }],
        condition: "Used",
        seller: { feedbackPercentage: "99.7", feedbackScore: 3414 },
        itemWebUrl: "https://www.ebay.com/itm/123?_skw=tracking",
        buyingOptions: ["FIXED_PRICE", "BEST_OFFER"],
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        itemId: "v1|123|0",
        price: 181.5,
        shipping: 12,
        deliveredCost: 193.5,
        currency: "USD",
        shippingStatus: "known",
        itemUrl: "https://www.ebay.com/itm/123",
        specs: {
          cpu: ["i5-8500T"],
          memory: ["16GB DDR4"],
          storage: ["256GB NVMe"],
          networking: ["WiFi", "BT"],
          power: ["65W"],
        },
      }),
    ]);
  });

  it("sorts known delivered costs first and never treats missing shipping as free", () => {
    const result = normalizeListings([
      {
        itemId: "unknown-shipping",
        title: "Mini PC",
        price: { value: "100.00", currency: "USD" },
        shippingOptions: [{ shippingCostType: "CALCULATED" }],
      },
      {
        itemId: "known-shipping",
        title: "Mini PC",
        price: { value: "120.00", currency: "USD" },
        shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }],
      },
    ]);

    expect(result.map(item => item.itemId)).toEqual(["known-shipping", "unknown-shipping"]);
    expect(result[1]).toMatchObject({
      shipping: null,
      deliveredCost: null,
      shippingStatus: "calculated_at_checkout",
    });
  });

  it("drops malformed items without a usable price", () => {
    expect(normalizeListings([
      { itemId: "missing-price", title: "No price" },
      { itemId: "bad-price", title: "Bad price", price: { value: "nope", currency: "USD" } },
    ])).toEqual([]);
  });
});

describe("filterItemsByTitleTerms", () => {
  const items = [
    { title: "Mini PC i5 16 GB DDR4 256GB SSD" },
    { title: "Mini PC i5 8GB DDR4 256GB SSD" },
    { title: "Mini PC i5 16GB DDR4 No HDD" },
  ];

  it("normalizes spacing while enforcing required and excluded terms", () => {
    expect(filterItemsByTitleTerms(items, ["16GB", "SSD"], ["No HDD"]))
      .toEqual([items[0]]);
  });
});
