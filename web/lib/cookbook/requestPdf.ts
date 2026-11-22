import type { CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";

/** The web app's own server makes the PDF (app/api/cookbook/pdf/route.ts). Under the app's base path. */
export const COOKBOOK_PDF_PATH = "/app/api/cookbook/pdf";

/** Which recipes printed without their photo, by position in the book. */
export const MISSING_PHOTOS_HEADER = "X-Cookbook-Missing-Photos";

export type PdfFailure =
  /** Several books in a row: wait a minute. */
  | "busy"
  /** The session ran out. */
  | "signed_out"
  /** The server can't make PDFs right now (or, in local development, at all). */
  | "unavailable"
  | "failed";

export class PdfRequestError extends Error {
  constructor(readonly reason: PdfFailure) {
    super(`Cookbook PDF: ${reason}`);
    this.name = "PdfRequestError";
  }
}

export type PdfResult = { file: Blob; missingPhotos: number[] };

function failureFor(status: number): PdfFailure {
  if (status === 429) return "busy";
  if (status === 401) return "signed_out";
  if (status === 503 || status === 404) return "unavailable";
  return "failed";
}

/** Sends the book to the server and returns the PDF. Throws `PdfRequestError`, or an AbortError when cancelled. */
export async function requestCookbookPdf(
  book: CookbookBook,
  options: { accessToken: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<PdfResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(COOKBOOK_PDF_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.accessToken}` },
      body: JSON.stringify({ book }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    console.warn("[cookbook] PDF request failed", error);
    throw new PdfRequestError("failed");
  }
  if (!response.ok) throw new PdfRequestError(failureFor(response.status));
  const file = await response.blob();
  if (file.size === 0) throw new PdfRequestError("failed");
  const missingPhotos = (response.headers.get(MISSING_PHOTOS_HEADER) ?? "")
    .split(",")
    .map((part) => Number.parseInt(part, 10))
    .filter((index) => Number.isInteger(index) && index >= 0);
  return { file: file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" }), missingPhotos };
}

/**
 * Saves the file the way a download link does. The address is let go a minute later, not at once: Safari reads it
 * after the click returns.
 */
export function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
