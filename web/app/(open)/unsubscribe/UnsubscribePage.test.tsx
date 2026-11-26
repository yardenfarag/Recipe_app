import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@shared/i18n/locales/en";

import i18n from "@/lib/i18n";

import UnsubscribePage from "./page";

const USER = "10000000-0000-4000-8000-00000000aa01";
const TOKEN = "a".repeat(64);

let search = "";
let user: { id: string } | null = null;
const setLanguage = vi.fn();
const setEmailOptOutFromLink = vi.fn();

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user, loading: false }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage, ready: true }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@shared/lib/supabase/emailPreferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/emailPreferences")>()),
  setEmailOptOutFromLink: (...args: unknown[]) => setEmailOptOutFromLink(...args),
}));

const wrap = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <UnsubscribePage />
    </I18nextProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  search = `u=${USER}&t=${TOKEN}&l=en`;
  user = null;
});

describe("UnsubscribePage", () => {
  it("unsubscribes on opening, says what that covers, and turns emails back on", async () => {
    setEmailOptOutFromLink.mockResolvedValue("ok");
    wrap();
    expect(await screen.findByRole("heading", { level: 1, name: en.messages.unsubscribedTitle })).toBeTruthy();
    expect(screen.getByText(en.messages.unsubscribedBody)).toBeTruthy();
    expect(setEmailOptOutFromLink).toHaveBeenCalledTimes(1);
    expect(setEmailOptOutFromLink).toHaveBeenCalledWith({ userId: USER, token: TOKEN }, true);
    expect(screen.getByRole("link", { name: en.messages.openSettings }).getAttribute("href")).toBe("/settings/emails");

    fireEvent.click(screen.getByRole("button", { name: en.messages.resubscribe }));
    expect(await screen.findByRole("heading", { level: 1, name: en.messages.resubscribedTitle })).toBeTruthy();
    expect(setEmailOptOutFromLink).toHaveBeenLastCalledWith({ userId: USER, token: TOKEN }, false);
    expect(screen.getByRole("button", { name: en.messages.unsubscribeAgain })).toBeTruthy();
  });

  it("says a link without its account or token didn't work, without calling the server", async () => {
    search = `u=${USER}`;
    wrap();
    expect(await screen.findByRole("heading", { level: 1, name: en.messages.invalidTitle })).toBeTruthy();
    expect(setEmailOptOutFromLink).not.toHaveBeenCalled();
  });

  it("tells a wrong link from a failure, and a retry repeats what was asked", async () => {
    setEmailOptOutFromLink.mockResolvedValueOnce("invalid_link");
    const first = wrap();
    expect(await screen.findByRole("heading", { level: 1, name: en.messages.invalidTitle })).toBeTruthy();
    first.unmount();

    setEmailOptOutFromLink.mockResolvedValueOnce("failed").mockResolvedValueOnce("ok");
    wrap();
    expect(await screen.findByRole("heading", { level: 1, name: en.messages.failedTitle })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.common.tryAgainAction }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: en.messages.unsubscribedTitle })).toBeTruthy());
    expect(setEmailOptOutFromLink).toHaveBeenLastCalledWith({ userId: USER, token: TOKEN }, true);
  });

  it("shows a guest the page in the email's language", async () => {
    search = `u=${USER}&t=${TOKEN}&l=he`;
    setEmailOptOutFromLink.mockResolvedValue("ok");
    wrap();
    await screen.findByRole("heading", { level: 1, name: en.messages.unsubscribedTitle });
    expect(setLanguage).toHaveBeenCalledWith("he");
  });

  it("leaves a signed-in account's language alone", async () => {
    search = `u=${USER}&t=${TOKEN}&l=he`;
    user = { id: USER };
    setEmailOptOutFromLink.mockResolvedValue("ok");
    wrap();
    await screen.findByRole("heading", { level: 1, name: en.messages.unsubscribedTitle });
    expect(setLanguage).not.toHaveBeenCalled();
  });
});
