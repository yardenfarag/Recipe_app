import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { PantryItem, ScanItem, ScanPhoto } from "@shared/types/pantry";

import { ScanReview } from "@/components/pantry/ScanReview";
import i18n from "@/lib/i18n";

const item = (name: string, over: Partial<ScanItem> = {}): ScanItem => ({
  name,
  name_en: name.toLowerCase(),
  brand: "",
  aisle: "dairy",
  confidence: "high",
  container_unknown: false,
  ...over,
});

const photo = (items: ScanItem[], over: Partial<ScanPhoto> = {}): ScanPhoto => ({
  id: "p1",
  scan_id: "s1",
  place: "fridge",
  quality: "ok",
  items,
  truncated: false,
  from_phone: false,
  created_at: "2026-11-26T10:00:00Z",
  ...over,
});

const saved: PantryItem[] = [
  { id: "old-butter", name: "Butter", nameEn: "butter", brand: "", place: "fridge", aisle: "dairy", source: "scan", addedAt: "", lastSeenAt: "" },
];

function renderReview(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <I18nextProvider i18n={i18n}>
      <ScanReview
        photos={[photo([item("Milk", { brand: "Tnuva" }), item("Flour", { confidence: "low", aisle: "pantry" })])]}
        saved={saved}
        onBack={vi.fn()}
        onSave={onSave}
      />
    </I18nextProvider>,
  );
  return onSave;
}

describe("ScanReview", () => {
  it("says the list can be wrong, puts what Pinch wasn't sure of first and unticked, and the rest ticked", () => {
    renderReview();
    expect(screen.getByText(/Pinch can miss things or get them wrong/)).toBeDefined();
    const unsure = screen.getByRole("region", { name: "Not sure about these" });
    expect(within(unsure).getByRole("checkbox", { name: /Flour/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("checkbox", { name: /Milk/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Tnuva")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save 1 item" })).toBeDefined();
  });

  it("asks about saved items the photos didn't show, and never removes them unless ticked", async () => {
    const onSave = renderReview();
    const notSeen = screen.getByRole("region", { name: "Not in these photos" });
    expect(within(notSeen).getByRole("checkbox", { name: /Butter/ }).getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save 1 item" }));
    });
    expect(onSave).toHaveBeenCalledWith([{ name: "Milk", nameEn: "milk", brand: "Tnuva", place: "fridge", aisle: "dairy", source: "scan" }], []);
  });

  it("saves ticked items, renamed names without the old English name, added items, and what's gone", async () => {
    const onSave = renderReview();
    fireEvent.click(screen.getByRole("checkbox", { name: /Flour/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rename Flour" }));
    const box = screen.getByRole("textbox", { name: "Rename Flour" });
    fireEvent.change(box, { target: { value: "Spelt flour" } });
    fireEvent.submit(box.closest("form")!);
    fireEvent.change(screen.getByRole("textbox", { name: "Add something we missed" }), { target: { value: "Eggs" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Fridge" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Not in these photos" })).getByRole("checkbox", { name: /Butter/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save 3 items" }));
    });
    const [keep, removeIds] = onSave.mock.calls[0];
    expect(keep).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Milk", nameEn: "milk" }),
        expect.objectContaining({ name: "Spelt flour", nameEn: "" }),
        expect.objectContaining({ name: "Eggs", nameEn: "", place: "fridge" }),
      ]),
    );
    expect(removeIds).toEqual(["old-butter"]);
  });
});
