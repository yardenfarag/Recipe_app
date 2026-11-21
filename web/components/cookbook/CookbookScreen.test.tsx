import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeCollection } from "@shared/types/collection";
import type { Recipe } from "@shared/types/recipe";

import { CookbookScreen } from "@/components/cookbook/CookbookScreen";
import { preparePrintFrame } from "@/lib/cookbook/printFrame";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const recipe = (id: string, title: string, extra: Partial<Recipe> = {}): Recipe => ({
  id,
  title,
  ingredients: [{ name: "salt", quantity: 1, unit: "pinch" }],
  instructions: [{ step: 1, text: "Cook it." }],
  servings: 2,
  extraction_status: "full",
  source_language: "en",
  ...extra,
});

let library: { recipes: Recipe[]; loading: boolean; error: string | null };
let collections: RecipeCollection[];
let params: URLSearchParams;
const replace = vi.fn();

vi.mock("next/navigation", () => ({ useSearchParams: () => params, useRouter: () => ({ replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/recipe/useMeasurementSystem", () => ({ useMeasurementSystem: () => ({ system: "original", setSystem: vi.fn() }) }));
vi.mock("@/lib/library/useRecipes", () => ({
  useRecipes: () => ({ ...library, loadingMore: false, hasMore: false, total: library.recipes.length, refresh: vi.fn(), ensureAllLoaded: vi.fn() }),
}));
vi.mock("@/lib/library/useCollections", () => ({ useCollections: () => ({ collections, loading: false, error: null }) }));

const printing = vi.hoisted(() => ({
  print: vi.fn(),
  dispose: vi.fn(),
  html: "",
  photoResults: [] as boolean[],
}));
vi.mock("@/lib/cookbook/printFrame", () => ({
  preparePrintFrame: vi.fn(async (html: string) => {
    printing.html = html;
    return { print: printing.print, dispose: printing.dispose };
  }),
  openInNewTab: vi.fn(() => true),
}));
vi.mock("@/lib/cookbook/loadImages", () => ({
  loadImages: vi.fn(async (urls: (string | null)[], options: { onProgress?: (done: number, total: number) => void }) => {
    const wanted = urls.filter(Boolean).length;
    options.onProgress?.(0, wanted);
    options.onProgress?.(wanted, wanted);
    return urls.map((url, index) => Boolean(url) && (printing.photoResults[index] ?? true));
  }),
}));

function renderScreen() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <CookbookScreen />
      </TooltipProvider>
    </I18nextProvider>,
  );
}

const book = () => screen.getByRole("list", { name: "Your book" });
const pick = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^${name},`) }));

beforeEach(() => {
  sessionStorage.clear();
  params = new URLSearchParams();
  replace.mockReset();
  printing.print.mockReset();
  printing.html = "";
  printing.photoResults = [];
  library = {
    recipes: [
      recipe("r1", "Lemon Pasta", { image_url: "https://cdn.example.com/pasta.jpg" }),
      recipe("r2", "Chocolate Cake", { image_url: "https://cdn.example.com/cake.jpg" }),
      recipe("r3", "Green Salad"),
    ],
    loading: false,
    error: null,
  };
  collections = [{ id: "c1", name: "Weeknight", created_at: "", recipeIds: ["r1", "r3"] }];
});

describe("CookbookScreen", () => {
  it("lists recipes A to Z and puts picked ones in the book in the order picked", () => {
    renderScreen();
    const rows = screen.getAllByRole("checkbox").map((row) => row.getAttribute("aria-label")?.split(",")[0]);
    expect(rows).toEqual(["Chocolate Cake", "Green Salad", "Lemon Pasta"]);

    pick("Lemon Pasta");
    pick("Chocolate Cake");
    expect(screen.getByRole("checkbox", { name: /^Lemon Pasta,/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(book()).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Lemon Pasta"),
      expect.stringContaining("Chocolate Cake"),
    ]);
    expect(screen.getByTestId("cookbook-cover-preview").textContent).toContain("2 recipes");
  });

  it("adds a whole collection at once", () => {
    renderScreen();
    fireEvent.click(within(screen.getByRole("group", { name: "Collections" })).getByRole("button", { name: "Weeknight" }));
    fireEvent.click(screen.getByRole("button", { name: /Select all/ }));
    expect(within(book()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Clear" })).toBeDefined();
  });

  it("starts from a collection link, titled after it, and clears the address", () => {
    params = new URLSearchParams("collection=c1");
    renderScreen();
    expect((screen.getByLabelText("Cookbook title") as HTMLInputElement).value).toBe("Weeknight");
    expect(within(book()).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Green Salad"),
      expect.stringContaining("Lemon Pasta"),
    ]);
    expect(replace).toHaveBeenCalledWith("/cookbook");
  });

  it("moves and removes recipes, keeping focus on the row", () => {
    params = new URLSearchParams("recipe=r1&recipe=r2&recipe=r3");
    renderScreen();
    const down = screen.getByRole("button", { name: "Move Lemon Pasta down" });
    down.focus();
    fireEvent.click(down);
    const order = () => within(book()).getAllByRole("listitem").map((item) => item.textContent?.replace(/^\d+\.?/, ""));
    expect(order()[0]).toContain("Chocolate Cake");
    expect(order()[1]).toContain("Lemon Pasta");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Lemon Pasta down");

    fireEvent.click(screen.getByRole("button", { name: "Remove Chocolate Cake" }));
    expect(within(book()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: /^Chocolate Cake,/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("asks for a title and at least one recipe", () => {
    renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "Create PDF" })[0]!);
    expect(screen.getByRole("alert").textContent).toBe("Pick at least one recipe.");

    pick("Green Salad");
    fireEvent.change(screen.getByLabelText("Cookbook title"), { target: { value: "  " } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create PDF" })[0]!);
    expect(screen.getByText("Enter a title.")).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText("Cookbook title"));
  });

  it("builds the book with the chosen options, prints it, and offers to print again", async () => {
    printing.photoResults = [true, false];
    params = new URLSearchParams("recipe=r1&recipe=r2");
    renderScreen();
    fireEvent.change(screen.getByLabelText("Cookbook title"), { target: { value: "Family book" } });
    fireEvent.click(screen.getByRole("radio", { name: "US Letter" }));

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Create PDF" })[0]!);
    });

    const dialog = await screen.findByRole("dialog", { name: "Cookbook created" });
    await vi.waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
    expect(printing.html).toContain("<title>Family book</title>");
    expect(printing.html).toContain("@page { size: letter;");
    expect(printing.html.indexOf("Lemon Pasta")).toBeLessThan(printing.html.indexOf("Chocolate Cake"));
    expect(printing.html).toContain('src="https://cdn.example.com/pasta.jpg"');
    // The cake's photo did not load, so its page gets the placeholder.
    expect(printing.html).not.toContain("cake.jpg");
    expect(within(dialog).getByText(/couldn’t be loaded/)).toBeDefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Print again" }));
    expect(printing.print).toHaveBeenCalledTimes(2);
  });

  it("leaves the photos out when switched off", async () => {
    params = new URLSearchParams("recipe=r1");
    renderScreen();
    fireEvent.click(screen.getByRole("switch", { name: "Recipe photos" }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Create PDF" })[0]!);
    });
    await screen.findByRole("dialog", { name: "Cookbook created" });
    expect(printing.html).not.toContain('class="hero"');
  });

  it("says plainly when the book could not be made, and tries again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(preparePrintFrame).mockRejectedValueOnce(new Error("Print is unavailable"));
    params = new URLSearchParams("recipe=r3");
    renderScreen();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Create PDF" })[0]!);
    });
    const failed = await screen.findByRole("dialog", { name: "Couldn’t create cookbook" });
    expect(within(failed).getByText("Couldn’t create the PDF. Please try again.")).toBeDefined();

    await act(async () => {
      fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    });
    await screen.findByRole("dialog", { name: "Cookbook created" });
    expect(printing.print).toHaveBeenCalledTimes(1);
  });

  it("brings back this tab's book after a reload", () => {
    params = new URLSearchParams("recipe=r3&recipe=r1");
    const first = renderScreen();
    first.unmount();
    params = new URLSearchParams();
    renderScreen();
    expect(within(book()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("says what to do when the library is empty", () => {
    library.recipes = [];
    renderScreen();
    expect(screen.getByText("Save recipes to your library first, then you can make a cookbook.")).toBeDefined();
  });
});
