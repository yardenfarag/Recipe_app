import { act, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnapProgress, TICK_MS } from "@/components/snap/SnapProgress";
import i18n from "@/lib/i18n";
import type { SnapJob } from "@/lib/snap/useSnap";

const tiktok: SnapJob = { intent: "extract", source: { type: "url", url: "https://www.tiktok.com/@cook/video/7312345678901234567" } };

const wrap = (job: SnapJob, finished = false) =>
  render(
    <I18nextProvider i18n={i18n}>
      <SnapProgress job={job} finished={finished} />
    </I18nextProvider>,
  );

/** Moves the clock on and lets the interval run. */
const wait = (seconds: number) =>
  act(() => {
    vi.advanceTimersByTime(seconds * 1000 + TICK_MS);
  });

describe("SnapProgress", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("en");
  });
  afterEach(() => vi.useRealTimers());

  it("starts with the reading line and a countdown", () => {
    wrap(tiktok);
    expect(screen.getByRole("status").textContent).toBe("Reading the video…");
    expect(screen.getByText("About 25 seconds left")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("counts down and moves the lines on without looping", () => {
    wrap(tiktok);
    wait(12);
    expect(screen.getByText("About 15 seconds left")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Writing the steps…");
    wait(20);
    expect(screen.getByText("Taking longer than usual…")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Almost ready…");
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(100);
  });

  it("fills the ring and drops the countdown once the recipe is in", () => {
    wrap(tiktok, true);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.queryByText(/seconds left/)).toBeNull();
  });

  it("reads a photo with its own line", () => {
    wrap({ intent: "extract", source: { type: "photo", base64: "AAAA", mimeType: "image/jpeg" } });
    expect(screen.getByRole("status").textContent).toBe("Reading the photo…");
  });
});
