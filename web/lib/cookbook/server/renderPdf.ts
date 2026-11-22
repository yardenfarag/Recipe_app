import puppeteer, { type Browser, type BrowserWorker, type Page } from "@cloudflare/puppeteer";

import { buildCookbookHtml, type CookbookBook } from "@shared/lib/cookbook/buildCookbookHtml";

import { withoutPhotos } from "@/lib/cookbook/pdfBook";
import type { RenderedPdf } from "@/lib/cookbook/server/handleCookbookPdf";

/**
 * What the book's page may load in the server's browser: its photos over https, the Google Fonts stylesheet and
 * fonts (Hebrew and Arabic need them; Cloudflare's browser has no Hebrew font), and nothing else. No scripts, no
 * frames, no requests to anywhere. The page is ours (the shared builder escapes every word), so this is a second lock.
 */
export const COOKBOOK_CSP =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; base-uri 'none'; form-action 'none'";

/** How long the photos and fonts get to arrive before a page is printed without the stragglers. */
const LOAD_TIMEOUT_MS = 25_000;
const FONTS_TIMEOUT_MS = 5_000;
const PDF_TIMEOUT_MS = 90_000;

export function withContentSecurityPolicy(html: string): string {
  return html.replace("<head>", `<head>\n<meta http-equiv="Content-Security-Policy" content="${COOKBOOK_CSP}" />`);
}

/** A string, not a function: the Worker's bundler renames functions, and the renamed code fails in the browser. */
const BROKEN_PHOTOS = `Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src)`;

/** Lays the page out and waits for its photos and fonts; returns the photos that didn't arrive or won't show. */
async function layOut(page: Page, html: string): Promise<string[]> {
  const isTimeout = (error: unknown) => error instanceof Error && error.name === "TimeoutError";
  try {
    // "load": the photos and the font stylesheet are in.
    await page.setContent(withContentSecurityPolicy(html), { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
    // Then the font files the stylesheet asks for. `createPDFStream` waits for the fonts too.
    await page.waitForNetworkIdle({ idleTime: 300, timeout: FONTS_TIMEOUT_MS }).catch((error: unknown) => {
      if (!isTimeout(error)) throw error;
    });
  } catch (error) {
    // A slow photo site: print what arrived. Anything else is a real failure.
    if (!isTimeout(error)) throw error;
  }
  return (await page.evaluate(BROKEN_PHOTOS)) as string[];
}

/** Hands the PDF on as it comes, and lets the browser go once it has all gone out, or the download was cancelled. */
function streamThenClose(source: ReadableStream<Uint8Array>, close: () => Promise<void>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        await close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      await close();
    },
  });
}

/**
 * Makes the cookbook's PDF in Cloudflare's browser (Browser Rendering, the `BROWSER` binding). The photos load as a
 * browser loads them, so a recipe site's CORS settings don't matter. A photo that fails, or doesn't arrive in time,
 * gets the placeholder instead of an empty frame: the page is laid out again without it. The PDF is streamed rather
 * than held, since a big book with photos can run to tens of megabytes and a Worker has 128 MB.
 */
export async function renderCookbookPdf(endpoint: BrowserWorker, book: CookbookBook, signal: AbortSignal): Promise<RenderedPdf> {
  let browser: Browser | null = await puppeteer.launch(endpoint);
  const close = async () => {
    const open = browser;
    browser = null;
    await open?.close().catch((error: unknown) => console.warn("[cookbook-pdf] closing the browser failed", error));
  };
  const onAbort = () => void close();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const page = await browser.newPage();
    const broken = await layOut(page, buildCookbookHtml(book));
    const missing = new Set(broken);
    if (missing.size > 0 && !book.hideImages) {
      // Placeholders for those; the photos that did load come from the browser's cache.
      const still = await layOut(page, buildCookbookHtml(withoutPhotos(book, missing)));
      for (const url of still) missing.add(url);
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const stream = await page.createPDFStream({ preferCSSPageSize: true, printBackground: true, timeout: PDF_TIMEOUT_MS });
    signal.removeEventListener("abort", onAbort);
    return { pdf: streamThenClose(stream, close), missing };
  } catch (error) {
    signal.removeEventListener("abort", onAbort);
    await close();
    throw error;
  }
}
