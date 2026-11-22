import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "mode=signin&next=%2Frecipe%2F7" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: false, session: null } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.state }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn(), authRedirectUrl: (p: string) => `https://x/app/${p}` }));

const calls = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  sendSignInCode: vi.fn(),
  verifySignInCode: vi.fn(),
  verifyResetCode: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock("@shared/lib/supabase/auth", () => ({
  signInWithEmail: calls.signInWithEmail,
  signUpWithEmail: calls.signUpWithEmail,
  sendSignInCode: calls.sendSignInCode,
  verifySignInCode: calls.verifySignInCode,
  verifyResetCode: calls.verifyResetCode,
}));
vi.mock("@/lib/auth", () => ({
  requestPasswordReset: calls.requestPasswordReset,
  signInWithGoogle: calls.signInWithGoogle,
}));

import { AuthForm } from "./AuthForm";

function renderForm(search: string) {
  nav.search = search;
  return render(
    <I18nextProvider i18n={i18n}>
      <AuthForm />
    </I18nextProvider>,
  );
}

const typeInto = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.state = { user: null, loading: false, session: null };
  });

  it("signs in with email and password", async () => {
    calls.signInWithEmail.mockResolvedValue(undefined);
    renderForm("mode=signin");
    typeInto("Email", " Cook@Example.com ");
    typeInto("Password", "secret123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(calls.signInWithEmail).toHaveBeenCalledWith("cook@example.com", "secret123"));
  });

  it("shows the reason sign-in failed, in the app's own words for the error code", async () => {
    // What the auth helper throws: an English message for logs, Supabase's code, and the step that failed.
    calls.signInWithEmail.mockRejectedValue(
      Object.assign(new Error("English from the helper"), { code: "invalid_credentials", action: "signin" }),
    );
    renderForm("mode=signin");
    typeInto("Email", "cook@example.com");
    typeInto("Password", "wrong-pass1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The email or password is incorrect.");
  });

  it("never shows an error's raw text", async () => {
    calls.signInWithEmail.mockRejectedValue(new Error("Edge Function returned a non-2xx status code"));
    renderForm("mode=signin");
    typeInto("Email", "cook@example.com");
    typeInto("Password", "wrong-pass1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
  });

  it("checks the email and the new password before signing up", async () => {
    renderForm("mode=signup");
    typeInto("Email", "not-an-email");
    typeInto("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a valid email address.");

    typeInto("Email", "cook@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Use at least 8 characters.");
    expect(calls.signUpWithEmail).not.toHaveBeenCalled();
  });

  it("after signing up, says what to do with the email, and lets a mistyped address be fixed", async () => {
    calls.signUpWithEmail.mockResolvedValue({ needsConfirmation: true });
    renderForm("mode=signup");
    typeInto("Email", "cook@exmaple.com");
    typeInto("Password", "long-enough-1");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText(i18n.t("web.confirmEmailInstructions"))).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.differentEmail") }));
    // Back on the sign-up form, with the address there to correct.
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("cook@exmaple.com");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDefined();
  });

  it("goes back to the page the visitor wanted once signed in", () => {
    auth.state = { user: { id: "u1" }, loading: false, session: null };
    renderForm("mode=signin&next=%2Frecipe%2F7");
    expect(nav.replace).toHaveBeenCalledWith("/recipe/7");
  });

  it("ignores a next address that leaves the app", () => {
    auth.state = { user: { id: "u1" }, loading: false, session: null };
    renderForm("mode=signin&next=https%3A%2F%2Fevil.example");
    expect(nav.replace).toHaveBeenCalledWith("/");
  });

  it("signs in with an emailed code", async () => {
    calls.sendSignInCode.mockResolvedValue(undefined);
    calls.verifySignInCode.mockResolvedValue(undefined);
    renderForm("mode=code");
    typeInto("Email", "cook@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await screen.findByText("Check your email");
    expect(calls.sendSignInCode).toHaveBeenCalledWith("cook@example.com", "en");

    typeInto("6-digit code", "12 34 56");
    await waitFor(() => expect(calls.verifySignInCode).toHaveBeenCalledWith("cook@example.com", "123456"));
  });

  it("sends a reset code, then continues to choose a password", async () => {
    calls.requestPasswordReset.mockResolvedValue(undefined);
    calls.verifyResetCode.mockResolvedValue(undefined);
    renderForm("mode=forgot");
    typeInto("Email", "cook@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));
    await screen.findByText("Check your email");

    typeInto("6-digit code", "654321");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/reset-password?via=code"));
  });

  it("starts Google sign-in with the page to come back to", async () => {
    calls.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    renderForm("mode=signin&next=%2Fhub%2F3");
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    await waitFor(() => expect(calls.signInWithGoogle).toHaveBeenCalledWith("/hub/3"));
  });

  it("links to Privacy and Terms", () => {
    renderForm("mode=signin");
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("https://pinch-app.io/privacy.html");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("https://pinch-app.io/terms.html");
  });
});
