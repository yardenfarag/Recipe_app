import { describe, expect, it, vi } from "vitest";

import { signInPathFor } from "@/lib/nextPath";

import { frontDoorScript, WELCOME_WAIT_ATTRIBUTE } from "./frontDoor";

const SESSION_KEY = "sb-127-auth-token";

interface Visit {
  path: string;
  search?: string;
  storage?: Record<string, string>;
  browserLanguage?: string;
  storageBlocked?: boolean;
}

/** Runs the head script as the browser would on `path`, and reports what it did. */
function visit({ path, search = "", storage = {}, browserLanguage = "en-US", storageBlocked = false }: Visit) {
  const entries = Object.entries(storage);
  const fakeStorage = {
    get length() {
      if (storageBlocked) throw new Error("blocked");
      return entries.length;
    },
    key: (index: number) => entries[index]?.[0] ?? null,
    getItem: (key: string) => storage[key] ?? null,
  };
  const replace = vi.fn();
  const stop = vi.fn();
  const root = document.createElement("html");
  const run = new Function("localStorage", "document", "location", "navigator", "window", frontDoorScript());
  run(fakeStorage, { documentElement: root }, { pathname: path, search, replace }, { language: browserLanguage }, { stop });
  return { replacedWith: replace.mock.calls[0]?.[0] as string | undefined, stopped: stop.mock.calls.length > 0, root };
}

describe("the front door's head script", () => {
  it("sends a first-time visitor at /app straight to the welcome page, before anything else loads", () => {
    const result = visit({ path: "/app" });
    expect(result.replacedWith).toBe("/app/welcome");
    expect(result.stopped).toBe(true);
    // Nothing of the page it leaves is drawn meanwhile.
    expect(result.root.style.visibility).toBe("hidden");
    expect(visit({ path: "/app/" }).replacedWith).toBe("/app/welcome");
  });

  it("sends a browser that has signed in before to sign-in, keeping the Library's address as `next`", () => {
    const storage = { "pinch:onboardingComplete": "true" };
    expect(visit({ path: "/app", storage }).replacedWith).toBe(`/app${signInPathFor("/")}`);
    expect(visit({ path: "/app", search: "?favorites=1", storage }).replacedWith).toBe(`/app${signInPathFor("/?favorites=1")}`);
  });

  it("never moves a browser that holds a session", () => {
    const result = visit({ path: "/app", storage: { [SESSION_KEY]: "{}" } });
    expect(result.replacedWith).toBeUndefined();
    expect(result.root.style.visibility).toBe("");
  });

  it("doesn't take a sign-in in progress for a session", () => {
    expect(visit({ path: "/app", storage: { [`${SESSION_KEY}-code-verifier`]: "x" } }).replacedWith).toBe("/app/welcome");
  });

  it("leaves other pages to the app", () => {
    expect(visit({ path: "/app/hub" }).replacedWith).toBeUndefined();
    expect(visit({ path: "/app/recipe/1" }).replacedWith).toBeUndefined();
    expect(visit({ path: "/app/auth" }).replacedWith).toBeUndefined();
  });

  it("does nothing when storage can't be read, so the app decides as before", () => {
    expect(visit({ path: "/app", storageBlocked: true }).replacedWith).toBeUndefined();
  });

  describe("on the welcome page", () => {
    const waiting = (result: ReturnType<typeof visit>) => result.root.hasAttribute(WELCOME_WAIT_ATTRIBUTE);

    it("shows the page the server drew to an English-speaking visitor", () => {
      expect(waiting(visit({ path: "/app/welcome" }))).toBe(false);
      expect(waiting(visit({ path: "/app/welcome", search: "?next=%2Flist" }))).toBe(false);
    });

    it("holds it for a signed-in visitor, who is about to be sent into the app", () => {
      expect(waiting(visit({ path: "/app/welcome", storage: { [SESSION_KEY]: "{}" } }))).toBe(true);
    });

    it("holds it until it can be shown in the visitor's language", () => {
      expect(waiting(visit({ path: "/app/welcome", browserLanguage: "he-IL" }))).toBe(true);
      expect(waiting(visit({ path: "/app/welcome", storage: { "pinch:appLanguage": "es" } }))).toBe(true);
      // A language picked here wins over the browser's.
      expect(waiting(visit({ path: "/app/welcome", browserLanguage: "he-IL", storage: { "pinch:appLanguage": "en" } }))).toBe(false);
      // One the app doesn't speak gets English.
      expect(waiting(visit({ path: "/app/welcome", browserLanguage: "de-DE" }))).toBe(false);
    });

    it("isn't held on any other page", () => {
      expect(waiting(visit({ path: "/app/hub", browserLanguage: "he-IL", storage: { [SESSION_KEY]: "{}" } }))).toBe(false);
    });
  });
});
