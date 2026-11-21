import { afterEach, describe, expect, it, vi } from "vitest";

import { browserFromUserAgent, osFromUserAgent, webFeedbackContext } from "@/lib/settings/feedbackContext";

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feedback context on the web", () => {
  it("names the system and browser", () => {
    expect([osFromUserAgent(MAC_CHROME), browserFromUserAgent(MAC_CHROME)]).toEqual(["macOS", "Chrome"]);
    expect([osFromUserAgent(IPHONE_SAFARI), browserFromUserAgent(IPHONE_SAFARI)]).toEqual(["iOS", "Safari"]);
    expect([osFromUserAgent(WINDOWS_EDGE), browserFromUserAgent(WINDOWS_EDGE)]).toEqual(["Windows", "Edge"]);
    expect(osFromUserAgent("")).toBeNull();
  });

  it("says it came from the web, in the app's language", () => {
    vi.stubGlobal("navigator", { userAgent: WINDOWS_EDGE });
    expect(webFeedbackContext(" he ")).toEqual({
      app_version: null,
      build_number: null,
      platform: "web",
      os_version: "Windows",
      device_model: "Edge",
      locale: "he",
    });
  });
});
