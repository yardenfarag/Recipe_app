import { describe, expect, it } from "vitest";

import { formatCount, formatPercent, formatResetDate, formatUsd, nextFreeReset } from "@/lib/credits/format";

describe("credit formatting", () => {
  it("writes dollar prices the way the language does", () => {
    expect(formatUsd(4.99, "en")).toBe("$4.99");
    expect(formatUsd(0.0799, "en")).toBe("$0.08");
    // Spanish puts the decimal comma first and the currency after.
    expect(formatUsd(4.99, "es")).toMatch(/^4,99\s?US\$$/);
    expect(formatPercent(0.59, "en")).toBe("59%");
    expect(formatCount(1234, "en")).toBe("1,234");
  });

  it("brings free credits back on the first of next month, UTC", () => {
    expect(nextFreeReset(new Date("2026-11-21T10:00:00Z")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextFreeReset(new Date("2026-12-31T23:59:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(formatResetDate(new Date("2026-12-01T00:00:00Z"), "en")).toBe("December 1");
  });
});
