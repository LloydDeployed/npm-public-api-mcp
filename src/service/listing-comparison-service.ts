import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildHeadersFromInput, formatAxiosError, makeRequestWithTokenRefresh } from "../helper/http-helper.js";
import { buildBrowseSearchParams, filterItemsByTitleTerms, normalizeListings, type EbayItemSummary } from "../helper/listing-comparison.js";

const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

interface BrowseSearchResponse {
  total?: number;
  itemSummaries?: EbayItemSummary[];
  warnings?: unknown[];
}

export function registerListingComparisonTool(server: McpServer): void {
  server.registerTool(
    "search_and_compare_items",
    {
      description: "Search active fixed-price eBay listings and return compact, price-sorted comparisons. Includes known shipping and delivered cost, explicitly marks unknown shipping, seller feedback, condition, canonical item URL, and computer-spec hints found in listing titles. Read-only.",
      inputSchema: {
        query: z.string().min(2).describe("Specific product search, including required model/spec terms."),
        limit: z.number().int().min(1).max(50).default(20).describe("Maximum listings to inspect."),
        minPrice: z.number().nonnegative().optional().describe("Optional minimum item price in USD."),
        maxPrice: z.number().positive().optional().describe("Optional maximum item price in USD."),
        marketplaceId: z.string().default("EBAY_US").describe("eBay marketplace identifier."),
        mustInclude: z.array(z.string().min(1)).max(10).default([]).describe("Terms every returned title must contain; spacing and punctuation are ignored."),
        mustExclude: z.array(z.string().min(1)).max(10).default([]).describe("Terms returned titles must not contain; spacing and punctuation are ignored."),
      },
    },
    async input => {
      try {
        if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice) {
          return {
            content: [{ type: "text" as const, text: "minPrice must not exceed maxPrice" }],
            isError: true,
          };
        }

        const headers = await buildHeadersFromInput({
          "X-EBAY-C-MARKETPLACE-ID": [input.marketplaceId],
        }, true);
        const response = await makeRequestWithTokenRefresh({
          url: SEARCH_URL,
          method: "GET",
          headers,
          params: buildBrowseSearchParams(input),
        });
        const data = response.data as BrowseSearchResponse;
        const matchingItems = filterItemsByTitleTerms(
          data.itemSummaries ?? [],
          input.mustInclude,
          input.mustExclude,
        );
        const listings = normalizeListings(matchingItems);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              query: input.query,
              totalMatches: data.total ?? listings.length,
              inspectedCount: data.itemSummaries?.length ?? 0,
              comparedCount: listings.length,
              listings,
              warnings: data.warnings ?? [],
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatAxiosError(error) }],
          isError: true,
        };
      }
    },
  );
}
