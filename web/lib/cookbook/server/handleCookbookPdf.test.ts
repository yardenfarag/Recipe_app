import { describe, expect, it, vi } from "vitest";

import type { CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";

import { handleCookbookPdf, type CookbookPdfDeps } from "@/lib/cookbook/server/handleCookbookPdf";

const book = (overrides: Partial<CookbookBook> = {}): CookbookBook => ({
  title: "ספר המתכונים",
  language: "he",
  rtl: true,
  pageSize: "a4",
  copy: { brand: "Pinch", recipeCount: "2 מתכונים", ingredientsHeading: "מצרכים", stepsHeading: "שלבים" },
  hideImages: false,
  recipes: [
    {
      title: "Shakshuka",
      imageDataUri: "https://cdn.example.com/a.jpg",
      lang: "en",
      dir: "ltr",
      source: "example.com",
      servingsLabel: "2",
      timeLabel: "20 min",
      nutritionLabel: "Per serving: ~450 cal · 30 g protein · 40 g carbs · 18 g fat",
      ingredients: [{ amount: "4", name: "eggs" }],
      instructions: [{ step: 1, text: "Cook." }],
    },
    {
      title: "Hummus",
      imageDataUri: "https://cdn.example.com/b.jpg",
      source: "",
      servingsLabel: "",
      timeLabel: "",
      ingredients: [],
      instructions: [],
    },
  ],
  ...overrides,
});

const post = (body: unknown, headers: Record<string, string> = { Authorization: "Bearer good" }) =>
  new Request("https://next.pinch-app.io/app/api/cookbook/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const deps = (overrides: Partial<CookbookPdfDeps> = {}): CookbookPdfDeps => ({
  verifyUser: async (token) => (token === "good" ? "user-1" : null),
  render: async () => ({ pdf: new TextEncoder().encode("%PDF-1.7"), missing: new Set(["https://cdn.example.com/b.jpg"]) }),
  ...overrides,
});

describe("handleCookbookPdf", () => {
  it("makes the PDF for a signed-in account, named after the book, and says which photos are missing", async () => {
    const render = vi.fn(deps().render!);
    const response = await handleCookbookPdf(post({ book: book() }), deps({ render }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="___-________.pdf"; filename*=UTF-8''${encodeURIComponent("ספר-המתכונים.pdf")}`,
    );
    expect(response.headers.get("X-Cookbook-Missing-Photos")).toBe("1");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("%PDF-1.7");
    expect(render.mock.calls[0]![0]).toEqual(book());
  });

  it("turns away a missing or wrong sign-in before reading the book", async () => {
    const render = vi.fn();
    expect((await handleCookbookPdf(post({ book: book() }, {}), deps({ render }))).status).toBe(401);
    expect((await handleCookbookPdf(post({ book: book() }, { Authorization: "Bearer bad" }), deps({ render }))).status).toBe(401);
    expect(render).not.toHaveBeenCalled();
  });

  it("says 'busy' when the account has made too many books just now", async () => {
    const allow = vi.fn(async () => false);
    const response = await handleCookbookPdf(post({ book: book() }), deps({ allow }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(allow).toHaveBeenCalledWith("user-1");
  });

  it("refuses anything that isn't a book: HTML, bad shapes, other addresses for photos", async () => {
    const statuses = await Promise.all(
      [
        "<html>",
        { html: "<h1>hi</h1>" },
        { book: { ...book(), recipes: [] } },
        { book: { ...book(), pageSize: "a3" } },
        { book: { ...book(), language: "he\"><script>" } },
        { book: book({ recipes: [{ ...book().recipes[0]!, imageDataUri: "http://169.254.169.254/latest" }] }) },
        { book: book({ recipes: [{ ...book().recipes[0]!, imageDataUri: "file:///etc/passwd" }] }) },
        { book: book({ recipes: [{ ...book().recipes[0]!, title: "x".repeat(301) }] }) },
        { book: book({ recipes: [{ ...book().recipes[0]!, nutritionLabel: "x".repeat(301) }] }) },
        { book: { ...book(), recipes: [{ ...book().recipes[0]!, nutritionLabel: 450 }] } },
      ].map(async (body) => (await handleCookbookPdf(post(body), deps())).status),
    );
    expect(statuses).toEqual([400, 400, 400, 400, 400, 400, 400, 400, 400, 400]);
  });

  it("refuses a body over the limit without parsing it", async () => {
    const response = await handleCookbookPdf(post({ book: book() }, { Authorization: "Bearer good", "Content-Length": "9000000" }), deps());
    expect(response.status).toBe(413);
  });

  it("says 'unavailable' when there's no browser, or it fails, so the page can offer printing", async () => {
    expect((await handleCookbookPdf(post({ book: book() }), deps({ render: null }))).status).toBe(503);
    const failing = deps({ render: async () => Promise.reject(new Error("quota")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleCookbookPdf(post({ book: book() }), failing)).status).toBe(503);
  });

  it("only answers POST", async () => {
    const response = await handleCookbookPdf(new Request("https://next.pinch-app.io/app/api/cookbook/pdf"), deps());
    expect(response.status).toBe(405);
  });
});
