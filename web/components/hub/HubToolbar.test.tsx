import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { HubSort } from "@shared/lib/supabase/cookingHub";
import type { HubPlatform } from "@shared/types/recipeCard";

import { HubToolbar } from "@/components/hub/HubToolbar";
import i18n from "@/lib/i18n";

function Harness({ dir = "ltr", onToggleTag = vi.fn() }: { dir?: "ltr" | "rtl"; onToggleTag?: (tag: string) => void }) {
  const [platform, setPlatform] = useState<HubPlatform | "all">("all");
  const [sort, setSort] = useState<HubSort>("popular");
  const [search, setSearch] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  return (
    <I18nextProvider i18n={i18n}>
      <div dir={dir} style={{ direction: dir }}>
        <HubToolbar
          searchInput={null}
          search={search}
          onSearchChange={setSearch}
          platform={platform}
          onPlatformChange={setPlatform}
          sort={sort}
          onSortChange={setSort}
          availableTags={["vegan", "quick"]}
          selectedTags={["quick"]}
          onToggleTag={onToggleTag}
          onClearTags={vi.fn()}
          layout="grid"
          onLayoutChange={vi.fn()}
          tagsOpen={tagsOpen}
          onTagsOpenChange={setTagsOpen}
        />
      </div>
    </I18nextProvider>
  );
}

describe("HubToolbar", () => {
  it("the source is one Tab stop, and the arrow keys move the choice", () => {
    render(<Harness />);
    const all = screen.getByRole("radio", { name: "All" });
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(all.tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "YouTube" }).tabIndex).toBe(-1);

    fireEvent.keyDown(all, { key: "ArrowRight" });
    const youtube = screen.getByRole("radio", { name: "YouTube" });
    expect(youtube.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(youtube);

    fireEvent.keyDown(youtube, { key: "End" });
    expect(screen.getByRole("radio", { name: "Web" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Web" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "All" }).getAttribute("aria-checked")).toBe("true");
  });

  it("in a right-to-left page, the left arrow moves forward", () => {
    render(<Harness dir="rtl" />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "All" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "YouTube" }).getAttribute("aria-checked")).toBe("true");
  });

  it("sorts by popular or newest", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Newest" }));
    expect(screen.getByRole("radio", { name: "Newest" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Popular" }).getAttribute("aria-checked")).toBe("false");
  });

  it("opens the tags, says how many are on, and toggles one", () => {
    const onToggleTag = vi.fn();
    render(<Harness onToggleTag={onToggleTag} />);
    const toggle = screen.getByRole("button", { name: /Tags/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("1");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Quick" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Vegan" }));
    expect(onToggleTag).toHaveBeenCalledWith("vegan");
  });

  it("Escape clears the search", () => {
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Search the Hub" });
    fireEvent.change(input, { target: { value: "soup" } });
    expect((input as HTMLInputElement).value).toBe("soup");
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
  });
});
