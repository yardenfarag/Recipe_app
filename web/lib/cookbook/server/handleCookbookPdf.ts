import { cookbookFileName, type CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";

import { missingPhotoIndexes, parsePdfBook, PDF_LIMITS } from "@/lib/cookbook/pdfBook";
import { MISSING_PHOTOS_HEADER } from "@/lib/cookbook/requestPdf";

/**
 * The finished PDF (streamed as the browser hands it over, or whole), and the photo addresses that could not be
 * loaded (their pages show the placeholder).
 */
export type RenderedPdf = { pdf: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer>; missing: ReadonlySet<string> };

export type CookbookPdfDeps = {
  /** The account behind a sign-in token, or null when the token is not valid. */
  verifyUser: (accessToken: string) => Promise<string | null>;
  /** False when this account has made too many books just now. Absent: no limit (local development). */
  allow?: (userId: string) => Promise<boolean>;
  /** Makes the PDF. Null when this server has no browser to make it with (local `next start`, the browser tests). */
  render: ((book: CookbookBook, signal: AbortSignal) => Promise<RenderedPdf>) | null;
};

const json = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** `filename` for old browsers (ASCII only), `filename*` for the real name, Hebrew and Arabic included (RFC 6266). */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * POST /app/api/cookbook/pdf: the cookbook as a PDF download. The body is `{ book }`, the book as plain data
 * (`buildCookbookBook`); the server lays out the pages itself, so a request can only print a Pinch cookbook. Signed-in
 * accounts only, a few books a minute each, since every book keeps a browser busy for a while.
 *
 * Answers: 200 with the PDF, 400 for a book it can't read, 401 signed out, 413 too big, 429 too many, 503 when there
 * is no browser to make it with. The page offers printing for anything but 401.
 */
export async function handleCookbookPdf(request: Request, deps: CookbookPdfDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, "method_not_allowed", { Allow: "POST" });

  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json(401, "signed_out");
  const userId = await deps.verifyUser(token).catch((error: unknown) => {
    console.error("[cookbook-pdf] couldn't check the session", error);
    return undefined;
  });
  if (userId === undefined) return json(503, "unavailable");
  if (!userId) return json(401, "signed_out");

  if (deps.allow && !(await deps.allow(userId))) return json(429, "busy", { "Retry-After": "60" });

  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > PDF_LIMITS.bodyBytes) return json(413, "too_big");
  const body = await request.text();
  if (body.length > PDF_LIMITS.bodyBytes) return json(413, "too_big");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(400, "invalid");
  }
  const book = parsePdfBook((parsed as { book?: unknown } | null)?.book);
  if (!book) return json(400, "invalid");

  if (!deps.render) return json(503, "unavailable");
  try {
    const { pdf, missing } = await deps.render(book, request.signal);
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        ...(pdf instanceof Uint8Array ? { "Content-Length": String(pdf.byteLength) } : {}),
        "Content-Disposition": attachment(cookbookFileName(book.title)),
        "Cache-Control": "no-store",
        [MISSING_PHOTOS_HEADER]: missingPhotoIndexes(book, missing).join(","),
        "Access-Control-Expose-Headers": MISSING_PHOTOS_HEADER,
      },
    });
  } catch (error) {
    if (request.signal.aborted) return json(499, "cancelled");
    console.error("[cookbook-pdf] render failed", error);
    return json(503, "unavailable");
  }
}
