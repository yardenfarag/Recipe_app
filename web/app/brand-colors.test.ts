import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The mobile app's single source of brand colours (plain CommonJS).
const require = createRequire(import.meta.url);
const brand: Record<string, string> = require("../../shared/constants/brandColors.js");

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8");
const [light, dark] = css.split("@media (prefers-color-scheme: dark)");

const pairs: [cssVar: string, lightKey: string, darkKey: string][] = [
  ["--pinch-primary", "pinchPrimary", "pinchPrimaryDark"],
  ["--pinch-primary-soft", "pinchPrimarySoft", "pinchPrimarySoftDark"],
  ["--pinch-rose", "pinchRose", "pinchRoseDark"],
  ["--pinch-rose-soft", "pinchRoseSoft", "pinchRoseSoftDark"],
  ["--pinch-bg", "pinchBg", "pinchBgDark"],
  ["--pinch-surface", "pinchSurface", "pinchSurfaceDark"],
  ["--pinch-text", "pinchDark", "pinchTextDark"],
  ["--pinch-muted", "pinchMuted", "pinchMutedDark"],
  ["--pinch-border", "pinchBorder", "pinchBorderDark"],
];

function valueOf(block: string, cssVar: string): string | undefined {
  return block.match(new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toUpperCase();
}

describe("globals.css brand colours", () => {
  it.each(pairs)("%s matches brandColors.js", (cssVar, lightKey, darkKey) => {
    expect(valueOf(light, cssVar)).toBe(brand[lightKey].toUpperCase());
    expect(valueOf(dark, cssVar)).toBe(brand[darkKey].toUpperCase());
  });
});
