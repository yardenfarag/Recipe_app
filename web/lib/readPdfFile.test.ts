import { describe, expect, it } from "vitest";

import { MAX_PDF_BYTES } from "@shared/lib/supabase/extractRecipe";

import { isPdfFile, readPdfFile } from "@/lib/readPdfFile";

describe("readPdfFile", () => {
  it("reads a PDF as plain base64", async () => {
    const file = new File(["%PDF-1.7 soup"], "soup.pdf", { type: "application/pdf" });
    expect(await readPdfFile(file)).toEqual({ ok: true, base64: btoa("%PDF-1.7 soup") });
  });

  it("turns away a PDF over the limit without reading it", async () => {
    const file = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: MAX_PDF_BYTES + 1 });
    expect(await readPdfFile(file)).toEqual({ ok: false, reason: "too_large" });
  });

  it("knows a PDF by its type, or by its name when there is no type", () => {
    expect(isPdfFile(new File([""], "a.bin", { type: "application/pdf" }))).toBe(true);
    expect(isPdfFile(new File([""], "Cake.PDF"))).toBe(true);
    expect(isPdfFile(new File([""], "cake.png", { type: "image/png" }))).toBe(false);
    expect(isPdfFile(new File([""], "notes.pdf.txt", { type: "text/plain" }))).toBe(false);
  });
});
