import { describe, expect, it } from "vitest";

import { DEFAULT_HUB_FILTERS, hubAddressQuery, hubFiltersActive, hubFiltersFromAddress, lastHubHref, rememberHubQuery } from "@/lib/hub/hubAddress";

describe("hub address", () => {
  it("reads the filters, ignoring values it doesn't know", () => {
    const filters = hubFiltersFromAddress(new URLSearchParams("q=pasta&source=youtube&sort=newest&tag=vegan,quick&tag=quick"));
    expect(filters).toEqual({ search: "pasta", platform: "youtube", sort: "newest", tags: ["vegan", "quick"] });
    expect(hubFiltersFromAddress(new URLSearchParams("source=myspace&sort=oldest"))).toEqual(DEFAULT_HUB_FILTERS);
  });

  it("writes only what differs from the plain Hub, and reads back the same", () => {
    expect(hubAddressQuery(DEFAULT_HUB_FILTERS)).toBe("");
    const filters = { search: " soup ", platform: "tiktok" as const, sort: "newest" as const, tags: ["vegan", "dinner"] };
    const query = hubAddressQuery(filters);
    expect(query).toBe("?q=soup&source=tiktok&sort=newest&tag=vegan%2Cdinner");
    expect(hubFiltersFromAddress(new URLSearchParams(query))).toEqual({ ...filters, search: "soup" });
  });

  it("counts source, sort and tags as filters, but not the search", () => {
    expect(hubFiltersActive(DEFAULT_HUB_FILTERS)).toBe(false);
    expect(hubFiltersActive({ ...DEFAULT_HUB_FILTERS, sort: "newest" })).toBe(true);
    expect(hubFiltersActive({ ...DEFAULT_HUB_FILTERS, platform: "web" })).toBe(true);
    expect(hubFiltersActive({ ...DEFAULT_HUB_FILTERS, tags: ["x"] })).toBe(true);
  });

  it("Back to Hub returns to the last list's filters", () => {
    rememberHubQuery("?q=soup");
    expect(lastHubHref()).toBe("/hub?q=soup");
    rememberHubQuery("");
    expect(lastHubHref()).toBe("/hub");
  });
});
