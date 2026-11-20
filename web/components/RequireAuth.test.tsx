import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/recipe/42",
  search: "tab=steps",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: true, session: null } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.state }));

import { RequireAuth } from "./RequireAuth";

describe("RequireAuth", () => {
  beforeEach(() => {
    nav.replace.mockReset();
  });

  it("waits for the stored session before deciding", () => {
    auth.state = { user: null, loading: true, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("sends a signed-out visitor to sign-in, remembering the page", () => {
    auth.state = { user: null, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).toHaveBeenCalledWith("/auth?mode=signin&next=%2Frecipe%2F42%3Ftab%3Dsteps");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("shows the page to a signed-in visitor", () => {
    auth.state = { user: { id: "u1" }, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.getByText("secret")).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
