import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS, settingsSectionFor } from "@/lib/settings/sections";

describe("settingsSectionFor", () => {
  it("finds the page for an address, with or without a trailing slash", () => {
    expect(settingsSectionFor("/settings/appearance")?.id).toBe("appearance");
    expect(settingsSectionFor("/settings/recipe/")?.id).toBe("recipe");
  });

  it("is null on the settings home", () => {
    expect(settingsSectionFor("/settings")).toBeNull();
    expect(settingsSectionFor("/settings/")).toBeNull();
  });

  it("keeps the mobile app's paths, so old links still open the same page", () => {
    const hrefs = SETTINGS_SECTIONS.map((section) => section.href);
    for (const path of ["/settings/recipe", "/settings/appearance", "/settings/language", "/settings/support", "/settings/credits"]) {
      expect(hrefs).toContain(path);
    }
  });
});
