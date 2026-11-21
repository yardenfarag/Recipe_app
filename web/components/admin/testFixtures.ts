import type { Dashboard, DashboardPerson, DashboardWindow } from "@shared/lib/adminDashboard";

/** Test data for the admin pages' unit tests. */

export function windowOf(overrides: Partial<DashboardWindow> = {}): DashboardWindow {
  return {
    new_users: 0,
    active_users: 0,
    active_guests: 0,
    recipes_saved: 0,
    extractions: 0,
    extraction_failures: 0,
    ai_cost_usd: 0,
    ai_cost_admin_usd: 0,
    ai_cost_guest_usd: 0,
    purchases: 0,
    credits_sold: 0,
    revenue_usd: 0,
    ...overrides,
  };
}

export function personOf(overrides: Partial<DashboardPerson> = {}): DashboardPerson {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "cook@example.com",
    created_at: "2026-11-10T10:00:00Z",
    is_admin: false,
    token_balance: 0,
    plan: "free",
    recipes: 2,
    window_recipes: 2,
    extractions: 3,
    failures: 1,
    ai_cost_usd: 0.12,
    window_ai_cost_usd: 0.12,
    credits_bought: 0,
    spent_usd: 0,
    last_active_at: "2026-11-20T10:00:00Z",
    country: "IL",
    platform: "ios",
    heard_about: "tiktok",
    web_source: null,
    ...overrides,
  };
}

export function dashboardOf(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    range: {
      days: 30,
      tz: "Asia/Jerusalem",
      since: "2026-10-22T00:00:00Z",
      previous_since: "2026-09-22T00:00:00Z",
      include_admins: false,
      generated_at: new Date().toISOString(),
    },
    kpis: {
      current: windowOf({ new_users: 24, active_users: 40, recipes_saved: 61, extractions: 80, extraction_failures: 5, ai_cost_usd: 4.2, revenue_usd: 9.97, purchases: 3, credits_sold: 45 }),
      previous: windowOf({ new_users: 12, active_users: 30, recipes_saved: 40, extractions: 60, extraction_failures: 6, ai_cost_usd: 3, revenue_usd: 1.99, purchases: 1, credits_sold: 10 }),
    },
    totals: { users: 512, recipes: 3400, ai_cost_usd: 120, revenue_usd: 210, credits_sold: 900, paying_users: 31 },
    daily: [
      { day: "2026-11-19", signups: 2, recipes: 5, extractions: 6, failures: 1, ai_cost_usd: 0.3, active_users: 8, revenue_usd: 0 },
      { day: "2026-11-20", signups: 3, recipes: 4, extractions: 7, failures: 0, ai_cost_usd: 0.4, active_users: 9, revenue_usd: 4.99 },
    ],
    cost_by_action: [{ action: "extract", events: 85, failed: 5, cost_usd: 3.9, scrape_cost_usd: 0.4 }],
    cost_by_model: [{ model: "google/gemini-3.5-flash", calls: 120, cost_usd: 3.5, tokens: 900000 }],
    scrape_cost_usd: 0.4,
    recipes_by_platform: [
      { label: "tiktok", count: 40 },
      { label: "instagram", count: 21 },
    ],
    recipes_by_source: [{ label: "caption", count: 50 }],
    heard_about: [{ label: "tiktok", count: 9 }],
    traffic: [{ source: "chatgpt.com", visits: 30, visitors: 20, clicked: 6, guide_visits: 10 }],
    web_totals: { visits: 30, visitors: 20, clicked: 6 },
    funnel: { signed_up: 24, extracted: 18, saved: 15, saved_3: 7, purchased: 2 },
    people: [
      personOf(),
      personOf({ id: "00000000-0000-4000-8000-000000000002", email: "old@example.com", created_at: "2026-01-01T00:00:00Z", extractions: 0, failures: 0 }),
    ],
    recent_recipes: [
      {
        id: "r1",
        title: "Crispy rice salad",
        platform: "tiktok",
        url: "https://www.tiktok.com/@x/video/1",
        image_url: null,
        source: "caption",
        status: "full",
        created_at: "2026-11-20T09:00:00Z",
        user_id: "00000000-0000-4000-8000-000000000001",
        email: "cook@example.com",
      },
    ],
    recent_failures: [],
    purchases: [],
    ...overrides,
  };
}
