import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import en from "@shared/i18n/locales/en";
import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import Home from "./page";

describe("placeholder page", () => {
  it("shows the Pinch heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Pinch" })).toBeDefined();
  });

  it("shows a string from the app's shared language files", () => {
    render(<Home />);
    expect(screen.getByText(en.onboarding.welcomeTitle)).toBeDefined();
  });

  it("fills a translated string with a number from shared logic", () => {
    render(<Home />);
    expect(
      screen.getByText(`You get ${FREE_MONTHLY_EXTRACT_LIMIT} free credits at the start of each month.`),
    ).toBeDefined();
  });
});
