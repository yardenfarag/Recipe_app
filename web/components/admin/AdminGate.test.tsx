import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

const profile = vi.hoisted(() => ({ value: { isAdmin: false, loading: false } }));
vi.mock("@/lib/admin/useIsAdmin", () => ({ useIsAdmin: () => profile.value }));

import { AdminGate } from "./AdminGate";

function renderGate() {
  return render(
    <I18nextProvider i18n={i18n}>
      <AdminGate>
        <h1>Admin page</h1>
      </AdminGate>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  profile.value = { isAdmin: false, loading: false };
});

describe("AdminGate", () => {
  it("shows the page to an admin", () => {
    profile.value = { isAdmin: true, loading: false };
    renderGate();
    expect(screen.getByRole("heading", { name: "Admin page" })).toBeDefined();
  });

  it("says the page doesn't exist to anyone else, and never draws it", () => {
    renderGate();
    expect(screen.getByRole("heading", { name: "We couldn’t find that page" })).toBeDefined();
    expect(screen.queryByText("Admin page")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to Library" }).getAttribute("href")).toBe("/");
    expect(document.title).toBe("We couldn’t find that page · Pinch");
  });

  it("waits for the profile before deciding", () => {
    profile.value = { isAdmin: false, loading: true };
    renderGate();
    expect(screen.queryByText("Admin page")).toBeNull();
    expect(screen.queryByText("We couldn’t find that page")).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
  });
});
