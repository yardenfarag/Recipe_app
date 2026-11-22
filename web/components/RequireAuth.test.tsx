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

type TestUser = { id: string; created_at?: string; user_metadata?: Record<string, unknown> };
const auth = vi.hoisted(() => ({ state: { user: null as null | TestUser, loading: true, session: null } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.state }));

import { RequireAuth } from "./RequireAuth";

const justNow = () => new Date(Date.now() - 60_000).toISOString();

describe("RequireAuth", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.pathname = "/recipe/42";
    nav.search = "tab=steps";
    window.localStorage.clear();
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

  it("shows the welcome page to a first-time visitor at the front door", () => {
    nav.pathname = "/";
    nav.search = "";
    auth.state = { user: null, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).toHaveBeenCalledWith("/welcome");
  });

  it("sends a browser that has been in before to sign-in, even at the front door", () => {
    window.localStorage.setItem("pinch:onboardingComplete", "true");
    nav.pathname = "/";
    nav.search = "";
    auth.state = { user: null, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).toHaveBeenCalledWith("/auth?mode=signin");
  });

  it("shows the page to a signed-in visitor, and remembers this browser", () => {
    auth.state = { user: { id: "u1" }, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.getByText("secret")).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("pinch:onboardingComplete")).toBe("true");
  });

  it("sends a new account back to finish the onboarding it started here", () => {
    window.localStorage.setItem("pinch:onboardingPending", "u1");
    auth.state = { user: { id: "u1", created_at: justNow(), user_metadata: {} }, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).toHaveBeenCalledWith("/onboarding?next=%2Frecipe%2F42%3Ftab%3Dsteps");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("also when the account was made after Get started (an email confirmed in another tab)", () => {
    window.localStorage.setItem("pinch:onboardingPending", "new");
    nav.pathname = "/";
    nav.search = "";
    auth.state = { user: { id: "u9", created_at: justNow(), user_metadata: {} }, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(nav.replace).toHaveBeenCalledWith("/onboarding");
  });

  it("doesn't ask an account that finished on another device, and forgets the pending start", () => {
    window.localStorage.setItem("pinch:onboardingPending", "u1");
    auth.state = {
      user: { id: "u1", created_at: justNow(), user_metadata: { onboarded_at: justNow() } },
      loading: false,
      session: null,
    };
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.getByText("secret")).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("pinch:onboardingPending")).toBeNull();
  });

  it("ignores another account's pending start", () => {
    window.localStorage.setItem("pinch:onboardingPending", "someone-else");
    auth.state = { user: { id: "u1", created_at: justNow(), user_metadata: {} }, loading: false, session: null };
    render(<RequireAuth>secret</RequireAuth>);
    expect(screen.getByText("secret")).toBeDefined();
    expect(window.localStorage.getItem("pinch:onboardingPending")).toBe("someone-else");
  });

  it("leaves the onboarding page itself alone", () => {
    window.localStorage.setItem("pinch:onboardingPending", "u1");
    auth.state = { user: { id: "u1", created_at: justNow(), user_metadata: {} }, loading: false, session: null };
    render(<RequireAuth resumeOnboarding={false}>questions</RequireAuth>);
    expect(screen.getByText("questions")).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
