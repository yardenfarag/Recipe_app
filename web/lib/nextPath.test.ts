import { describe, expect, it } from "vitest";

import { safeNextPath, signInPathFor } from "./nextPath";

describe("safeNextPath", () => {
  it("keeps paths inside the app, with their query", () => {
    expect(safeNextPath("/recipe/123?tab=steps")).toBe("/recipe/123?tab=steps");
    expect(safeNextPath("/settings/language")).toBe("/settings/language");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["another site", "https://evil.example"],
    ["protocol-relative", "//evil.example/path"],
    ["backslash trick", "/\\evil.example"],
    ["relative", "recipe/1"],
    ["javascript", "javascript:alert(1)"],
  ])("sends %s values home", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("never returns to a sign-in page", () => {
    expect(safeNextPath("/auth?mode=signin")).toBe("/");
    expect(safeNextPath("/auth-callback?code=x")).toBe("/");
  });
});

describe("signInPathFor", () => {
  it("brings the visitor back to the page they wanted", () => {
    expect(signInPathFor("/recipe/1?x=y")).toBe("/auth?mode=signin&next=%2Frecipe%2F1%3Fx%3Dy");
  });

  it("leaves next out for the home page", () => {
    expect(signInPathFor("/")).toBe("/auth?mode=signin");
  });
});
