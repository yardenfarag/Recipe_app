import { afterEach, describe, expect, it } from "vitest";

import { THEME_PACK_ORDER, ThemePacks } from "@shared/constants/themes";

import { activeSection } from "@/components/shell/nav";

import { bootScript, parsePack, parsePreference, themeCss } from "./theme";

describe("themeCss", () => {
  const css = themeCss();

  it("has every theme pack in light and dark", () => {
    for (const id of THEME_PACK_ORDER) {
      for (const scheme of ["light", "dark"] as const) {
        const rule = css.match(new RegExp(`:root\\[data-pack="${id}"\\]\\[data-scheme="${scheme}"\\]\\{([^}]*)\\}`));
        expect(rule, `${id} ${scheme}`).not.toBeNull();
        expect(rule![1]).toContain(`--c-primary:${ThemePacks[id][scheme].primary};`);
        expect(rule![1]).toContain(`--c-on-primary:${ThemePacks[id][scheme].onPrimary};`);
        expect(rule![1]).toContain(`color-scheme:${scheme};`);
      }
    }
  });

  it("falls back to Mist, following the system, before any choice is applied", () => {
    expect(css).toContain(`:root{color-scheme:light;--c-text:${ThemePacks.mist.light.text};`);
    expect(css).toContain(`@media (prefers-color-scheme: dark){:root:not([data-scheme]){color-scheme:dark;--c-text:${ThemePacks.mist.dark.text};`);
  });
});

describe("bootScript", () => {
  afterEach(() => {
    localStorage.clear();
    const root = document.documentElement;
    for (const name of ["data-pack", "data-scheme", "lang", "dir"]) root.removeAttribute(name);
  });

  const run = () => new Function(bootScript())();

  it("applies the saved theme and language before the page paints", () => {
    localStorage.setItem("pinch.themePreference", "dark");
    localStorage.setItem("pinch.themePack", "dracula");
    localStorage.setItem("pinch:appLanguage", "he");
    run();
    const root = document.documentElement;
    expect(root.getAttribute("data-pack")).toBe("dracula");
    expect(root.getAttribute("data-scheme")).toBe("dark");
    expect(root.lang).toBe("he");
    expect(root.dir).toBe("rtl");
  });

  it("migrates the old Potter pack and ignores unknown values", () => {
    localStorage.setItem("pinch.themePack", "potter");
    localStorage.setItem("pinch:appLanguage", "xx");
    window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
    run();
    expect(document.documentElement.getAttribute("data-pack")).toBe("wizard");
    expect(document.documentElement.getAttribute("data-scheme")).toBe("light");
    expect(document.documentElement.getAttribute("lang")).toBeNull();
  });
});

describe("parsing saved values", () => {
  it("reads preferences and packs defensively", () => {
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("weird")).toBe("system");
    expect(parsePack("sunny")).toBe("sunny");
    expect(parsePack("potter")).toBe("wizard");
    expect(parsePack(null)).toBe("mist");
  });
});

describe("activeSection", () => {
  it.each([
    ["/", "library"],
    ["/recipe/12", "library"],
    ["/recipe/preview", "snap"],
    ["/add", "snap"],
    // The Hub is a tab of the Library (PIN-77).
    ["/hub", "library"],
    ["/hub/4", "library"],
    ["/plan", "plan"],
    ["/list", "list"],
    ["/settings/language", "settings"],
    ["/unknown", null],
  ])("%s belongs to %s", (path, section) => {
    expect(activeSection(path)).toBe(section);
  });
});
