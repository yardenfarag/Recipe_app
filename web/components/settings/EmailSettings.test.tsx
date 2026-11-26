import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@shared/i18n/locales/en";

import { EmailSettings } from "@/components/settings/EmailSettings";
import i18n from "@/lib/i18n";

const prefs = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/supabase/emailPreferences", () => ({
  fetchMessagePreferences: (...args: unknown[]) => prefs.fetch(...args),
  saveMessagePreference: (...args: unknown[]) => prefs.save(...args),
}));
vi.mock("@shared/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/components/settings/SettingsPageHeader", () => ({ SettingsPageHeader: () => <h1>Emails</h1> }));

const wrap = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <EmailSettings />
    </I18nextProvider>,
  );

const emailSwitch = () => screen.findByRole("switch", { name: en.messages.emailLabel });

beforeEach(() => vi.clearAllMocks());

describe("EmailSettings", () => {
  it("shows an opt-out made from an email link as off, and turns it back on", async () => {
    prefs.fetch.mockResolvedValue({ emailOptOut: true, pushOptOut: false });
    prefs.save.mockResolvedValue(undefined);
    wrap();
    const row = await emailSwitch();
    expect(row.getAttribute("aria-checked")).toBe("false");
    expect(prefs.fetch).toHaveBeenCalledWith("u1");

    fireEvent.click(row);
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(prefs.save).toHaveBeenCalledWith("u1", "emailOptOut", false);
  });

  it("puts the switch back and says so when saving fails", async () => {
    prefs.fetch.mockResolvedValue({ emailOptOut: false, pushOptOut: false });
    prefs.save.mockRejectedValue(new Error("offline"));
    wrap();
    const row = await emailSwitch();
    fireEvent.click(row);
    expect(prefs.save).toHaveBeenCalledWith("u1", "emailOptOut", true);
    await waitFor(() => expect(row.getAttribute("aria-checked")).toBe("true"));
    expect(toast).toHaveBeenCalledWith(en.messages.saveFailed, "error");
  });

  it("offers to try again when the setting can't be read", async () => {
    prefs.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ emailOptOut: false, pushOptOut: false });
    wrap();
    expect(await screen.findByText(en.messages.loadFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect((await emailSwitch()).getAttribute("aria-checked")).toBe("true");
  });
});
