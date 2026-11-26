import { expect, test, type Page } from "@playwright/test";

import { formatCount, formatUsd, type Dashboard } from "../../shared/lib/adminDashboard";
import {
  accessToken,
  adminCalls,
  createAdminPagesUsers,
  deleteAdminPagesUsers,
  purchasedCredits,
  rpcAs,
  selectAs,
  type AdminPagesUsers,
  type SeedUser,
} from "./adminSeed";
import { accountMenuButton, signInWithPassword } from "./helpers";

// The admin pages (PIN-144): only admins can open them or read their data, the dashboard shows the database's
// numbers, and every page fits a laptop screen. The admin and the ordinary account are new for this file
// (adminSeed.ts); the shared test account never becomes an admin. Nothing here calls an Edge Function.

// The dashboard buckets days in the browser's timezone; the numbers are compared with the database's for the same one.
test.use({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1280, height: 800 } });

let users: AdminPagesUsers;

test.beforeAll(async () => {
  users = await createAdminPagesUsers();
});

test.afterAll(async () => {
  await deleteAdminPagesUsers(users);
});

const main = (page: Page) => page.locator("#main");

async function signIn(page: Page, user: SeedUser) {
  await page.goto("/app/auth?mode=signin");
  await signInWithPassword(page, user.email, user.password);
  await expect(page.locator("#main h1:visible")).toBeVisible();
}

/** The page is no wider than the window: nothing to scroll sideways. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const ADMIN_PATHS = ["dashboard", "insights", "users", "usage", "activity", "messages"];

test.describe("an admin", () => {
  test("finds the admin pages in the account menu, and the dashboard shows the database's numbers", async ({ page }) => {
    await signIn(page, users.admin);
    await accountMenuButton(page).click();
    await page.getByRole("menuitem", { name: "Admin" }).click();
    await expect(page).toHaveURL(/\/app\/admin\/dashboard$/);
    await expect(page.locator("#main h1:visible")).toHaveText("Dashboard");
    await expect(page).toHaveTitle("Admin dashboard · Pinch");
    await expect(main(page).getByText("What happened in the last 30 days")).toBeVisible();

    // The same call the page makes, for the same range and timezone. Tests run one at a time, so nothing changes between.
    const dashboard = (await rpcAs(await accessToken(users.admin), "admin_dashboard", { p_days: 30, p_tz: "UTC", p_include_admins: false }))
      .body as Dashboard;
    const now = dashboard.kpis.current;
    const tiles: [string, string][] = [
      ["New sign-ups", formatCount(now.new_users)],
      ["Active people", formatCount(now.active_users)],
      ["Recipes saved", formatCount(now.recipes_saved)],
      ["Extractions", formatCount(now.extractions)],
      ["AI cost", formatUsd(now.ai_cost_usd)],
      ["Revenue (approx.)", formatUsd(now.revenue_usd)],
    ];
    for (const [label, value] of tiles) {
      await expect(main(page).getByRole("group", { name: label, exact: true }).locator("[data-stat-value]")).toHaveText(value);
    }

    // A wider range asks again.
    await main(page).getByRole("button", { name: "7 days" }).click();
    await expect(main(page).getByText("What happened in the last 7 days")).toBeVisible();

    // Every tab fits a laptop screen.
    for (const tab of ["Overview", "People", "Recipes", "Costs & revenue", "Failures"]) {
      await main(page).getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await expect(main(page).getByRole("tabpanel")).toBeVisible();
      await expectNoSidewaysScroll(page);
    }
  });

  test("opens a person's details from the People tab", async ({ page }) => {
    await signIn(page, users.admin);
    await page.goto("/app/admin/dashboard");
    await main(page).getByRole("tab", { name: /^People/ }).click();
    await main(page).getByRole("button", { name: "Everyone" }).click();
    await main(page).getByRole("searchbox", { name: "Search people by email" }).fill(users.member.email);
    await main(page).getByRole("table").getByText(users.member.email).click();
    const sheet = page.getByRole("dialog", { name: users.member.email });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Credit balance")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("grants credits to a user", async ({ page }) => {
    await signIn(page, users.admin);
    await page.goto("/app/admin/users");
    await expect(page.locator("#main h1:visible")).toHaveText("People");
    await main(page).getByRole("searchbox", { name: "Search email" }).fill(users.member.email);
    const before = await purchasedCredits(users.member.id);
    await main(page).getByLabel(`Credit amount, ${users.member.email}`).fill("10");
    await main(page).getByRole("button", { name: `Apply adjustment, ${users.member.email}` }).click();
    await expect(page.getByText(`${users.member.email} now has ${before + 10} purchased credits.`)).toBeVisible();
    await expect.poll(() => purchasedCredits(users.member.id)).toBe(before + 10);
    // Purchased is the third column.
    await expect(main(page).getByRole("row").filter({ hasText: users.member.email }).getByRole("cell").nth(2)).toHaveText(String(before + 10));

    // The same on the cost & support page, by user id.
    await page.goto("/app/admin/usage");
    await expect(page.locator("#main h1:visible")).toHaveText("Usage & support");
    await main(page).getByLabel("User ID").fill(users.member.id);
    await main(page).getByLabel("Credit amount").fill("-3");
    await main(page).getByRole("button", { name: "Apply adjustment" }).click();
    await expect(page.getByText(`User ${users.member.id.slice(0, 8)} now has ${before + 7} purchased credits.`)).toBeVisible();
    await expect.poll(() => purchasedCredits(users.member.id)).toBe(before + 7);
  });

  test("writes, saves and deletes an in-app message", async ({ page }) => {
    await signIn(page, users.admin);
    await page.goto("/app/admin/messages");
    await expect(page.locator("#main h1:visible")).toHaveText("Messages");
    await main(page).getByRole("button", { name: "New message" }).click();
    await expect(page.locator("#main h1:visible")).toHaveText("New message");
    await expectNoSidewaysScroll(page);

    const name = `E2E message ${Date.now()}`;
    await main(page).getByLabel(/^Name/).fill(name);
    await main(page).getByLabel(/^Title in English/).fill("Hello from the tests");
    await main(page).getByLabel(/^Body in English/).fill("Nothing to see.");
    await expect(main(page).getByRole("complementary", { name: "Preview" })).toBeVisible();
    await main(page).getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.locator("#main h1:visible")).toHaveText("Messages");
    await expect(main(page).getByRole("status").getByText(`Saved “${name}”.`)).toBeVisible();
    const card = main(page).getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
    await expect(card.getByText("Draft")).toBeVisible();
    await expect(card.getByText("To: Everyone signed in")).toBeVisible();

    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete this message?" }).getByRole("button", { name: "Delete" }).click();
    await expect(main(page).getByRole("heading", { name })).toHaveCount(0);
  });

  test("every admin page opens and fits a laptop screen", async ({ page }) => {
    await signIn(page, users.admin);
    const headings: Record<string, string> = {
      dashboard: "Dashboard",
      insights: "Insights",
      users: "People",
      usage: "Usage & support",
      activity: "Activity",
      messages: "Messages",
    };
    for (const path of ADMIN_PATHS) {
      await page.goto(`/app/admin/${path}`);
      await expect(page.locator("#main h1:visible")).toHaveText(headings[path]);
      await expect(main(page).getByRole("navigation", { name: "Admin pages" }).locator("a[aria-current=page]")).toBeVisible();
      // Let the data arrive before measuring.
      await expect(main(page).locator("[data-skeleton], [aria-busy=true]")).toHaveCount(0);
      await expect(main(page).getByRole("alert")).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    }
    // Activity shows each session's platform and app version (this sign-in is one of them).
    await page.goto("/app/admin/activity");
    await main(page).getByRole("searchbox", { name: "Search email, user id or install id" }).fill(users.admin.email);
    await expect(main(page).getByRole("heading", { name: /^Sessions \(\d+\)$/ })).toBeVisible();

    // /admin opens the dashboard.
    await page.goto("/app/admin");
    await expect(page).toHaveURL(/\/app\/admin\/dashboard$/);
  });
});

test.describe("an account that isn't an admin", () => {
  test("has no admin item in the menu, and gets “not found” on every admin page", async ({ page }) => {
    await signIn(page, users.member);
    await accountMenuButton(page).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    for (const path of ["", ...ADMIN_PATHS]) {
      await page.goto(`/app/admin/${path}`);
      await expect(main(page).getByRole("heading", { name: "We couldn’t find that page" })).toBeVisible();
      await expect(main(page).getByRole("navigation", { name: "Admin pages" })).toHaveCount(0);
      await expect(page).toHaveTitle("We couldn’t find that page · Pinch");
    }
  });

  test("can't read or change admin data, even by calling the database directly", async () => {
    const token = await accessToken(users.member);
    for (const call of adminCalls(users.admin.id)) {
      const result = await rpcAs(token, call.name, call.args);
      const said = JSON.stringify(result.body);
      expect(result.status, `${call.name} answered ${said}`).toBeGreaterThanOrEqual(400);
      // Refused by the function's own admin check, not by a typo in the call.
      expect(said, call.name).toMatch(/forbidden|admin_only/);
    }
    // Nothing happened to the admin's account.
    expect(await purchasedCredits(users.admin.id)).toBe(0);
    expect((await rpcAs(await accessToken(users.admin), "admin_user_detail", { p_user_id: users.admin.id })).status).toBe(200);

    // Tables the admin pages read directly: row rules show this account only its own rows.
    const profiles = await selectAs(token, "profiles?select=id");
    expect(profiles.rows).toEqual([{ id: users.member.id }]);
    const notMine = `or=(user_id.is.null,user_id.neq.${users.member.id})`;
    for (const table of [
      "ai_usage_events",
      "product_events",
      "purchase_credit_grants",
      "token_ledger",
      "feedback",
      "support_tickets",
      "extract_usage_monthly",
      "interaction_events",
    ]) {
      const result = await selectAs(token, `${table}?select=user_id&${notMine}&limit=1`);
      expect(result.rows, `${table} showed someone else's rows`).toEqual([]);
    }
  });
});
