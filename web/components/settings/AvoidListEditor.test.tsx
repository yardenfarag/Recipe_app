import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { EMPTY_KITCHEN_PROFILE, type KitchenProfile } from "@shared/lib/kitchenProfile";

import { AvoidListEditor } from "@/components/settings/AvoidListEditor";
import { addSettingsStrings } from "@/components/settings/testStrings";
import i18n from "@/lib/i18n";

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));

beforeAll(addSettingsStrings);

const wrap = (profile: KitchenProfile, onChange = vi.fn()) => {
  render(
    <I18nextProvider i18n={i18n}>
      <AvoidListEditor profile={profile} onChange={onChange} />
    </I18nextProvider>,
  );
  return onChange;
};

describe("AvoidListEditor", () => {
  it("asks for the notice before the first allergy, and saves it with the date it was accepted", () => {
    const onChange = wrap(EMPTY_KITCHEN_PROFILE);
    fireEvent.click(screen.getByRole("button", { name: "Peanuts" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Before you add an allergy" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "I understand" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const saved = onChange.mock.calls[0][0] as KitchenProfile;
    expect(saved.allergies).toEqual(["peanuts"]);
    expect(Number.isNaN(Date.parse(saved.allergyNoticeAcceptedAt ?? ""))).toBe(false);
  });

  it("adds nothing when the notice is closed", () => {
    const onChange = wrap(EMPTY_KITCHEN_PROFILE);
    fireEvent.click(screen.getByRole("button", { name: "Sesame" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("once accepted, adds and removes allergies straight away", () => {
    const accepted: KitchenProfile = { ...EMPTY_KITCHEN_PROFILE, allergies: ["milk"], allergyNoticeAcceptedAt: "2026-11-01T00:00:00.000Z" };
    const onChange = wrap(accepted);
    expect(screen.getByRole("button", { name: "Milk" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Always check the ingredients and product labels yourself/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Eggs" }));
    expect((onChange.mock.calls[0][0] as KitchenProfile).allergies).toEqual(["milk", "eggs"]);
    fireEvent.click(screen.getByRole("button", { name: "Milk" }));
    expect((onChange.mock.calls[1][0] as KitchenProfile).allergies).toEqual([]);
  });

  it("adds a typed dislike with Enter, ignoring a repeat", () => {
    const onChange = wrap({ ...EMPTY_KITCHEN_PROFILE, dislikes: ["Celery"] });
    const field = screen.getByRole("textbox", { name: "Something else…" });
    fireEvent.change(field, { target: { value: "  raisins " } });
    fireEvent.submit(field);
    expect((onChange.mock.calls[0][0] as KitchenProfile).dislikes).toEqual(["Celery", "raisins"]);

    fireEvent.change(field, { target: { value: "celery" } });
    fireEvent.submit(field);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("takes a typed dislike off with its remove button", () => {
    const onChange = wrap({ ...EMPTY_KITCHEN_PROFILE, dislikes: ["Celery"] });
    fireEvent.click(screen.getByRole("button", { name: "Remove Celery" }));
    expect((onChange.mock.calls[0][0] as KitchenProfile).dislikes).toEqual([]);
  });
});
