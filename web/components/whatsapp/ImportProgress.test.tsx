import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchProgress } from "@shared/lib/whatsappImport";

import { ImportDone, ImportProgress, startingProgress } from "@/components/whatsapp/ImportProgress";
import { candidate } from "@/components/whatsapp/testFixtures";
import i18n from "@/lib/i18n";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const BATCH = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
const chat = { readPhoto: vi.fn(() => null) };

const progress = (patch: Partial<BatchProgress>): BatchProgress => ({ ...startingProgress(BATCH), ...patch });
const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
const row = (id: string) => screen.getByText(`tiktok.com ${id}`).closest("li")!;

describe("ImportProgress", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("starts with everything waiting", () => {
    wrap(<ImportProgress candidates={BATCH} chat={chat} progress={startingProgress(BATCH)} stopping={false} onStop={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Importing 0 of 4…" })).toBeDefined();
    expect(screen.getAllByText("Waiting")).toHaveLength(4);
    expect(screen.getByText("Keep this page open until it’s done.")).toBeDefined();
  });

  it("shows each item's state and how far it is", () => {
    const now = progress({
      done: 2,
      saved: 1,
      failed: 1,
      items: { a: "saved", b: "failed", c: "working", d: "waiting" },
      recipeIds: { a: "recipe-a" },
    });
    wrap(<ImportProgress candidates={BATCH} chat={chat} progress={now} stopping={false} onStop={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Importing 2 of 4…" })).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(row("a").querySelector("a")?.getAttribute("href")).toBe("/recipe/recipe-a");
    expect(row("a").textContent).toContain("Saved");
    expect(row("b").textContent).toContain("Couldn’t import");
    expect(row("c").textContent).toContain("Importing…");
    expect(row("d").textContent).toContain("Waiting");
  });

  it("Stop asks the batch to stop", () => {
    const onStop = vi.fn();
    wrap(<ImportProgress candidates={BATCH} chat={chat} progress={startingProgress(BATCH)} stopping={false} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});

describe("ImportDone", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  const done = (final: BatchProgress, extra: { onBackToList?: () => void } = {}) => {
    const handlers = { onRetryFailed: vi.fn(), onChooseAnother: vi.fn(), ...extra };
    wrap(<ImportDone candidates={BATCH} chat={chat} progress={final} {...handlers} />);
    return handlers;
  };

  it("sums up a finished import, counting the ones already saved", () => {
    done(progress({ done: 4, saved: 3, alreadySaved: 1, items: { a: "saved", b: "saved", c: "saved", d: "already_saved" } }));
    expect(screen.getByRole("heading", { name: "All done" })).toBeDefined();
    expect(screen.getByText("4 recipes saved to your Library")).toBeDefined();
    expect(screen.getByRole("link", { name: "Go to your Library" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Try the failed ones again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("offers to try the failed ones again", () => {
    const handlers = done(progress({ done: 4, saved: 2, failed: 2, items: { a: "saved", b: "failed", c: "saved", d: "failed" } }));
    expect(screen.getByText("2 couldn’t be imported")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try the failed ones again" }));
    expect(handlers.onRetryFailed).toHaveBeenCalledOnce();
  });

  it("says the credits ran out, with a way to get more and back to the rest", () => {
    const onBackToList = vi.fn();
    done(
      progress({ done: 2, saved: 1, stoppedForCredits: true, items: { a: "saved", b: "out_of_credits", c: "waiting", d: "waiting" } }),
      { onBackToList },
    );
    expect(screen.getByRole("heading", { name: "1 recipe saved to your Library" })).toBeDefined();
    expect(screen.getByText("Stopped when your credits ran out. The rest are still on the list.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Get more credits" }).getAttribute("href")).toBe("/settings/credits");
    // The item that hit the limit never ran: it isn't marked failed, nor waiting for an import that is over.
    expect(row("b").textContent).not.toMatch(/Couldn’t import|Waiting/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBackToList).toHaveBeenCalledOnce();
  });

  it("says when the day's import limit stopped it, without offering credits", () => {
    const handlers = { onRetryFailed: vi.fn(), onChooseAnother: vi.fn() };
    wrap(
      <ImportDone
        candidates={BATCH}
        chat={chat}
        progress={progress({ done: 2, saved: 1, stoppedForCredits: true, items: { a: "saved", b: "out_of_credits", c: "waiting", d: "waiting" } })}
        dailyLimit
        {...handlers}
      />,
    );
    expect(screen.getByText(/reached today’s import limit/)).toBeDefined();
    expect(screen.queryByText(/credits ran out/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Get more credits" })).toBeNull();
  });

  it("says when the cook stopped it", () => {
    const { onChooseAnother } = done(progress({ done: 1, saved: 1, cancelled: true, items: { a: "saved", b: "waiting", c: "waiting", d: "waiting" } }));
    expect(screen.getByText("Stopped. The rest are still on the list.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Get more credits" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose another chat" }));
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });
});
