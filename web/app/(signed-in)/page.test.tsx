import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import en from "@shared/i18n/locales/en";

import i18n from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/" }));

import LibraryPage from "./page";

describe("Library placeholder", () => {
  it("has the Library heading and the browser tab title", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LibraryPage />
      </I18nextProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: en.library.title })).toBeDefined();
    expect(document.title).toBe("Library · Pinch");
  });

  it("says what the Library will do, and offers Snap to fill it", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <LibraryPage />
      </I18nextProvider>,
    );
    expect(screen.getByRole("heading", { level: 2, name: en.web.soon.library.title })).toBeDefined();
    expect(screen.getByRole("link", { name: en.snap.title }).getAttribute("href")).toBe("/add");
  });
});
