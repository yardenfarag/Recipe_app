import { describe, expect, it, vi } from "vitest";

import { createActivityLog, createBatchSender, restoreSessionId, saveSessionId } from "./activityLog";
import { APP_VERSION, ACTIVITY_PLATFORM } from "./appInfo";
import { screenNameFor } from "./screenName";
import { tapNameFor } from "./tapName";

describe("screenNameFor", () => {
  it("names the five main pages as the mobile tabs, so both apps count them together", () => {
    expect(screenNameFor("/", {})).toBe("/(tabs)");
    expect(screenNameFor("/hub", {})).toBe("/(tabs)/hub");
    expect(screenNameFor("/add", {})).toBe("/(tabs)/add");
    expect(screenNameFor("/list", {})).toBe("/(tabs)/list");
    expect(screenNameFor("/settings", {})).toBe("/(tabs)/settings");
    expect(screenNameFor("/settings/credits", {})).toBe("/settings/credits");
  });

  it("logs the route pattern, never an id or a token", () => {
    expect(screenNameFor("/recipe/9f1c2d3e-0000-4000-8000-000000000001", { id: "9f1c2d3e-0000-4000-8000-000000000001" })).toBe(
      "/recipe/[id]",
    );
    expect(screenNameFor("/recipe/abc/edit", { id: "abc" })).toBe("/recipe/[id]/edit");
    expect(screenNameFor("/s/tok_123", { token: "tok_123" })).toBe("/s/[token]");
    expect(screenNameFor("/docs/a/b", { slug: ["a", "b"] })).toBe("/docs/[...slug]");
  });

  it("hides id-looking parts of an address no page matched", () => {
    expect(screenNameFor("/recipe/12345", null)).toBe("/recipe/[id]");
    expect(screenNameFor("/x/abcdef0123456789xyz", null)).toBe("/x/[id]");
    expect(screenNameFor("/settings/recipe-preferences", null)).toBe("/settings/recipe-preferences");
  });
});

describe("tapNameFor", () => {
  function within(html: string, selector: string) {
    document.body.innerHTML = html;
    return document.querySelector(selector);
  }

  it("takes the nearest pressable element's data-track", () => {
    expect(tapNameFor(within('<button data-track="recipe.save"><span id="t">Save</span></button>', "#t"))).toBe("recipe.save");
    expect(tapNameFor(within('<a href="/hub" data-track="nav.hub">Hub</a>', "a"))).toBe("nav.hub");
    expect(tapNameFor(within('<div role="menuitem" data-track="menu.x">X</div>', "div"))).toBe("menu.x");
  });

  it("logs an untagged button as unnamed and ignores clicks on text, disabled and aria-disabled controls", () => {
    expect(tapNameFor(within("<button>Go</button>", "button"))).toBe("unnamed");
    expect(tapNameFor(within("<p>Just text</p>", "p"))).toBeNull();
    expect(tapNameFor(within('<button disabled data-track="x">Go</button>', "button"))).toBeNull();
    expect(tapNameFor(within('<button aria-disabled="true" data-track="x">Go</button>', "button"))).toBeNull();
  });

  it("does not take a tagged card's id for an untagged button inside it", () => {
    expect(tapNameFor(within('<div data-track="card"><button id="b">More</button></div>', "#b"))).toBe("unnamed");
  });
});

describe("createBatchSender", () => {
  const events = [{ kind: "tap" as const, name: "recipe.save", screen: "/recipe/[id]", at: "2026-11-21T10:00:00.000Z" }];

  it("posts one keepalive request to log_interaction_events, as the account when signed in", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const send = createBatchSender({
      url: "http://127.0.0.1:54321/",
      key: "anon",
      getAuth: () => ({ accessToken: "jwt" }),
      getVisitorId: () => "visitor-1234",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await send("session-1", events);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:54321/rest/v1/rpc/log_interaction_events");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(init.body))).toEqual({
      p_session_id: "session-1",
      p_guest_install_id: "visitor-1234",
      p_platform: "web",
      p_app_version: APP_VERSION,
      p_events: [{ ...events[0], properties: {} }],
    });
  });

  it("drops a payload the database refused and throws on anything worth one retry", async () => {
    const refused = createBatchSender({
      url: "http://x",
      key: "anon",
      getAuth: () => null,
      getVisitorId: () => "visitor-1234",
      fetch: (async () => new Response(JSON.stringify({ code: "22023" }), { status: 400 })) as typeof fetch,
    });
    await expect(refused("s", events)).resolves.toBeUndefined();
    const down = createBatchSender({
      url: "http://x",
      key: "anon",
      getAuth: () => null,
      getVisitorId: () => "visitor-1234",
      fetch: (async () => new Response(null, { status: 503 })) as typeof fetch,
    });
    await expect(down("s", events)).rejects.toThrow("503");
  });
});

describe("the session id in the tab", () => {
  function fakeStore() {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  }

  it("keeps the session across a reload or a sign-in redirect, and starts a new one after 30 minutes away", () => {
    const store = fakeStore();
    saveSessionId(store, "s-1", 1_000);
    expect(restoreSessionId(store, 1_000 + 29 * 60_000)).toBe("s-1");
    expect(restoreSessionId(store, 1_000 + 31 * 60_000)).toBeNull();
    expect(restoreSessionId(null, 0)).toBeNull();
  });

  it("sends what is waiting when the tab is hidden, under the restored session", async () => {
    const store = fakeStore();
    saveSessionId(store, "s-restored", Date.now());
    const sent: string[] = [];
    const log = createActivityLog({
      send: async (session, batch) => {
        sent.push(`${session}:${batch.map((e) => e.name).join(",")}`);
      },
      sessionStore: store,
    });
    log.queue.screen("/(tabs)");
    log.queue.tap("library.recipe");
    log.hidden();
    await log.queue.flush();
    expect(sent).toEqual(["s-restored:/(tabs),library.recipe"]);
    expect(JSON.parse(store.getItem("pinch.activity.session") ?? "{}").id).toBe("s-restored");
  });
});

describe("app info", () => {
  it("names the new web app web with a -next version, read as the mobile version by targeting", () => {
    expect(ACTIVITY_PLATFORM).toBe("web");
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+-next$/);
  });
});
