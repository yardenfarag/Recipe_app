import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";
import { addOnboardingStrings } from "@/lib/onboarding/testStrings";

import { FirstRecipeGuide } from "./FirstRecipeGuide";

describe("FirstRecipeGuide", () => {
  beforeAll(() => addOnboardingStrings());

  it("points a new cook at Snap, with every way to a first recipe a real link", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <FirstRecipeGuide />
      </I18nextProvider>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Save your first recipe" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Snap a recipe" }).getAttribute("href")).toBe("/add");
    expect(screen.getByRole("link", { name: /Paste a link/ }).getAttribute("href")).toBe("/add");
    expect(screen.getByRole("link", { name: /Snap a photo/ }).getAttribute("href")).toBe("/add");
    expect(screen.getByRole("link", { name: /Pick one from the Hub/ }).getAttribute("href")).toBe("/hub");
    // As the mobile Library offers: write one down by hand (PIN-146).
    expect(screen.getByRole("link", { name: new RegExp(i18n.t("recipeEditor.entry.write")) }).getAttribute("href")).toBe("/recipe/edit");
  });
});
