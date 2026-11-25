import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeCard } from "@shared/types/recipeCard";

import i18n from "@/lib/i18n";
import type { useHub } from "@/lib/hub/useHub";

import HubPage from "./page";

type Hub = ReturnType<typeof useHub>;
let hub: Hub;

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/hub/useHub", () => ({ useHub: () => hub }));
vi.mock("@/lib/library/useLibraryLayout", () => ({ useLibraryLayout: () => ({ layout: "grid", setLayout: vi.fn() }) }));

const base = (): Hub => ({
  cards: [],
  loading: false,
  querying: false,
  loadingMore: false,
  error: null,
  errorLoadingMore: false,
  hasMore: false,
  total: 0,
  listEpoch: 0,
  diets: [],
  avoidList: { allergies: [], otherAllergies: [], dislikes: [] },
  avoidsAllergies: false,
  avoidsDislikes: false,
  search: "",
  setSearch: vi.fn(),
  selectedTags: [],
  toggleTag: vi.fn(),
  clearTags: vi.fn(),
  sort: "popular",
  setSort: vi.fn(),
  platform: "all",
  setPlatform: vi.fn(),
  clearFilters: vi.fn(),
  availableTags: [],
  loadMore: vi.fn(),
  retry: vi.fn(),
});

const card = { id: "c1", title: "Hub Soup", platform: "youtube", save_count: 2, ingredients: [], instructions: [], servings: 2 } as unknown as RecipeCard;

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <HubPage />
    </I18nextProvider>,
  );

beforeEach(() => {
  hub = base();
  // jsdom has no IntersectionObserver.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe("Hub page", () => {
  it("an empty Hub invites a first Snap", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "The Hub is just getting started" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Snap a recipe" }).getAttribute("href")).toBe("/add");
  });

  it("with a search and nothing found, offers to clear the filters", () => {
    hub = { ...base(), search: "zzz" };
    renderPage();
    expect(screen.getByRole("heading", { name: "No recipes match" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(hub.clearFilters).toHaveBeenCalled();
  });

  it("shows each card linking to its Hub page, with its source and saves", () => {
    hub = { ...base(), cards: [card], total: 1 };
    renderPage();
    expect(screen.getByRole("link", { name: "Hub Soup" }).getAttribute("href")).toBe("/hub/c1");
    expect(screen.getByText("YouTube · 2 saves")).toBeDefined();
    expect(screen.getByText("1 recipe")).toBeDefined();
  });

  it("flags the cook's allergies and dislikes on the cards, and says how the list is sorted (PIN-180)", () => {
    const peanut = { ...card, id: "c2", title: "Satay", ingredients: [{ name: "peanut butter" }], contains: ["peanuts", "onion"] } as unknown as RecipeCard;
    const onion = { ...card, id: "c3", title: "Onion tart", ingredients: [{ name: "onion" }], contains: ["onion"] } as unknown as RecipeCard;
    hub = {
      ...base(),
      cards: [card, onion, peanut],
      total: 3,
      avoidList: { allergies: ["peanuts"], otherAllergies: [], dislikes: ["Onion"] },
      avoidsAllergies: true,
      avoidsDislikes: true,
    };
    renderPage();
    expect(screen.getByText("Has ingredients from your allergies: Peanuts")).toBeDefined();
    expect(screen.getByText("Has foods you don’t like: Onion")).toBeDefined();
    expect(screen.getByText("Recipes with your allergies come last.")).toBeDefined();
    expect(screen.getByText("Recipes with foods you don’t like come later.")).toBeDefined();
  });

  it("when the first load fails, says so and tries again", () => {
    hub = { ...base(), error: "offline" };
    renderPage();
    expect(screen.getByRole("heading", { name: "Couldn’t load the Hub" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(hub.retry).toHaveBeenCalled();
  });

  it("when the next page fails, keeps the cards and offers a retry", () => {
    hub = { ...base(), cards: [card], total: 5, error: "offline", errorLoadingMore: true };
    renderPage();
    expect(screen.getByRole("link", { name: "Hub Soup" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(hub.retry).toHaveBeenCalled();
  });
});
