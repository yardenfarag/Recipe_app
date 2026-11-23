import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeCandidate } from "@shared/lib/whatsappImport";

import { ImportSummary, ReviewList } from "@/components/whatsapp/ReviewList";
import { candidate } from "@/components/whatsapp/testFixtures";
import i18n from "@/lib/i18n";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CANDIDATES: RecipeCandidate[] = [
  candidate("1"),
  candidate("2", { kind: "text", url: undefined, platform: undefined, preview: "Grandma's shakshuka", text: "Grandma's shakshuka\n4 eggs\n2 tomatoes" }),
  candidate("3", { kind: "photo", url: undefined, platform: undefined, preview: "Lemon cake", photo: { fileName: "00000012-PHOTO.jpg", mime: "image/jpeg" } }),
  candidate("4", { preview: "youtube.com saved", alreadySaved: true }),
];

const chat = { readPhoto: vi.fn(() => null) };

function Harness({ initial = [] as string[], onChange = vi.fn() }) {
  const [selected, setSelected] = useState(() => new Set(initial));
  return (
    <ReviewList
      candidates={CANDIDATES}
      chat={chat}
      selected={selected}
      onSelectedChange={(next) => {
        onChange(next);
        setSelected(next);
      }}
    />
  );
}

const wrap = (ui: React.ReactElement) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const ticked = () => screen.getAllByRole("checkbox").filter((element) => element.getAttribute("aria-checked") === "true");

describe("ReviewList", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists what was found, with who sent it and when", () => {
    wrap(<Harness />);
    expect(screen.getByRole("heading", { name: "Found 4 possible recipes" })).toBeDefined();
    expect(within(box(/tiktok.com 1/)).getByText("⁨Savta⁩ · ⁨May 12, 2024⁩")).toBeDefined();
    // A written recipe shows the rest of its text under the first line.
    expect(within(box(/Grandma's shakshuka/)).getByText("4 eggs 2 tomatoes")).toBeDefined();
  });

  it("ticks and unticks a row", () => {
    const onChange = vi.fn();
    wrap(<Harness onChange={onChange} />);
    fireEvent.click(box(/tiktok.com 1/));
    expect(box(/tiktok.com 1/).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box(/tiktok.com 1/));
    expect(box(/tiktok.com 1/).getAttribute("aria-checked")).toBe("false");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("shows a recipe already in the Library, but it can’t be ticked", () => {
    const onChange = vi.fn();
    wrap(<Harness onChange={onChange} />);
    const saved = box(/youtube.com saved/);
    expect(within(saved).getByText("Already in your Library")).toBeDefined();
    expect((saved as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saved);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Select all ticks everything that can be, and Clear unticks it", () => {
    wrap(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(ticked()).toHaveLength(3);
    expect(box(/youtube.com saved/).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByRole("button", { name: "Select all" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(ticked()).toHaveLength(0);
  });

  it("filters by kind, and Select all only takes what the filter shows", () => {
    wrap(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /Photo/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("radio", { name: /All/ }));
    expect(ticked().map((element) => element.textContent)).toEqual([expect.stringContaining("Lemon cake")]);
  });
});

describe("ImportSummary", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the credits needed against the balance", () => {
    const onImport = vi.fn();
    wrap(<ImportSummary variant="panel" count={3} balance={5} onImport={onImport} />);
    expect(screen.getByText("3 credits")).toBeDefined();
    expect(screen.getByText("You have 5 credits")).toBeDefined();
    expect(screen.queryByText(/more recipes than you have credits/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import 3 recipes" }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("says when there aren’t enough credits, and still lets the import start", () => {
    const onImport = vi.fn();
    wrap(<ImportSummary variant="panel" count={6} balance={1} onImport={onImport} />);
    expect(screen.getByText("6 credits")).toBeDefined();
    expect(screen.getByText("You have 1 credit")).toBeDefined();
    expect(screen.getByText(/more recipes than you have credits/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Get more credits" }).getAttribute("href")).toBe("/settings/credits");
    fireEvent.click(screen.getByRole("button", { name: "Import 6 recipes" }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("on phones keeps only the balance and the way to more credits in the bar", () => {
    wrap(<ImportSummary variant="bar" count={6} balance={1} onImport={vi.fn()} />);
    expect(screen.getByText("You have 1 credit")).toBeDefined();
    expect(screen.getByRole("link", { name: "Get more credits" })).toBeDefined();
    expect(screen.queryByText(/more recipes than you have credits/)).toBeNull();
  });

  it("can’t start with nothing ticked", () => {
    wrap(<ImportSummary variant="panel" count={0} balance={null} onImport={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Import 0 recipes" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/You have/)).toBeNull();
  });
});
