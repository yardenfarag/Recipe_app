import { beforeEach, describe, expect, it } from "vitest";

import { emptyForm, draftFromForm } from "@shared/lib/adminMessageForm";

import { DASHBOARD_PREFS_KEY, readDashboardPrefs, writeDashboardPrefs } from "./dashboardPrefs";
import { previewMessage } from "./messagePreview";
import { adminPageFor } from "./nav";

describe("adminPageFor", () => {
  it("finds the admin page from the address, with or without /app", () => {
    expect(adminPageFor("/admin/dashboard")).toBe("dashboard");
    expect(adminPageFor("/app/admin/users")).toBe("users");
    expect(adminPageFor("/admin/messages/")).toBe("messages");
    expect(adminPageFor("/admin")).toBeNull();
    expect(adminPageFor("/settings")).toBeNull();
    expect(adminPageFor(null)).toBeNull();
  });
});

describe("dashboard prefs", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to 30 days without admin accounts", () => {
    expect(readDashboardPrefs()).toEqual({ days: 30, includeAdmins: false });
  });

  it("keeps a choice, and ignores a range the dashboard doesn't offer", () => {
    writeDashboardPrefs({ days: 365, includeAdmins: true });
    expect(readDashboardPrefs()).toEqual({ days: 365, includeAdmins: true });
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify({ days: 3, includeAdmins: "yes" }));
    expect(readDashboardPrefs()).toEqual({ days: 30, includeAdmins: false });
    window.localStorage.setItem(DASHBOARD_PREFS_KEY, "not json");
    expect(readDashboardPrefs()).toEqual({ days: 30, includeAdmins: false });
  });
});

describe("previewMessage", () => {
  it("is the draft as the app would show it, with a stand-in id for a new message", () => {
    const form = { ...emptyForm(), name: "Hi", presentation: "banner" as const, bannerPosition: "bottom" as const };
    form.content.en = { ...form.content.en!, title: "Hello", body: "There" };
    const message = previewMessage(draftFromForm(form, []));
    expect(message).toMatchObject({ id: "preview", presentation: "banner", bannerPosition: "bottom", content: { en: { title: "Hello", body: "There" } } });
    expect("name" in message).toBe(false);
    expect(previewMessage({ ...draftFromForm(form, []), id: "m1" }).id).toBe("m1");
  });
});
