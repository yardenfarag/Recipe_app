import { describe, expect, it } from "vitest";

import { fingerprintDistance, fingerprintFromPixels, isSamePhoto } from "@/lib/pantry/photoFingerprint";

/** A 9x8 RGBA image from a brightness function. */
function image(light: (x: number, y: number) => number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) pixels.push(light(x, y), light(x, y), light(x, y), 255);
  return pixels;
}

describe("photo fingerprints", () => {
  const gradient = fingerprintFromPixels(image((x) => 255 - x * 20));
  const stripes = fingerprintFromPixels(image((x, y) => ((x + y) % 2 ? 230 : 20)));

  it("is 64 points", () => {
    expect(gradient).toHaveLength(64);
    expect(gradient).toBe("1".repeat(64));
  });

  it("a slightly brighter or noisier copy is the same photo", () => {
    const brighter = fingerprintFromPixels(image((x, y) => Math.min(255, 255 - x * 20 + 10 + ((x * 7 + y * 3) % 4))));
    expect(isSamePhoto(gradient, brighter)).toBe(true);
  });

  it("a different picture is not", () => {
    expect(fingerprintDistance(gradient, stripes)).toBeGreaterThan(20);
    expect(isSamePhoto(gradient, stripes)).toBe(false);
    expect(isSamePhoto(gradient, null)).toBe(false);
  });
});
