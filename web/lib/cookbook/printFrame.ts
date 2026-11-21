/** The finished book, ready in a page of its own, to print as often as wanted. */
export type PrintFrame = {
  /** Opens the browser's print dialog for the book ("Save as PDF" is the download). */
  print: () => void;
  /** Removes the page. */
  dispose: () => void;
};

const READY_TIMEOUT_MS = 20_000;
const FONTS_TIMEOUT_MS = 4_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function imagesSettled(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map((image) =>
      image.complete
        ? undefined
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  ).then(() => undefined);
}

/**
 * Writes the book into a hidden frame and waits until it can be printed: its pictures loaded and its fonts (Hebrew
 * and Arabic ones too) in. The browser lays the pages out in that frame, off to the side, so this screen stays as it
 * is. Waiting stops after a while: a picture or font that never arrives must not keep the print dialog from opening.
 *
 * A frame rather than a new tab: no pop-up to allow, and the print dialog opens over this screen.
 */
export async function preparePrintFrame(
  html: string,
  options: { signal?: AbortSignal; timeoutMs?: number; container?: HTMLElement } = {},
): Promise<PrintFrame> {
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.title = "cookbook";
  frame.dataset.cookbookPrint = "";
  // Not display:none: some browsers will not lay out, or print, a frame that is not displayed.
  Object.assign(frame.style, { position: "fixed", insetInlineEnd: "0", bottom: "0", width: "0", height: "0", border: "0", pointerEvents: "none" });
  (options.container ?? document.body).appendChild(frame);

  const dispose = () => frame.remove();
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    dispose();
    throw new Error("Print is unavailable");
  }

  doc.open();
  doc.write(html);
  doc.close();

  const fonts = doc.fonts?.ready ? Promise.race([doc.fonts.ready.then(() => undefined, () => undefined), delay(FONTS_TIMEOUT_MS)]) : Promise.resolve();
  const aborted = new Promise<never>((_, reject) => {
    options.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
  });
  try {
    await Promise.race([Promise.all([imagesSettled(doc), fonts]), delay(options.timeoutMs ?? READY_TIMEOUT_MS), aborted]);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    print: () => {
      win.focus();
      win.print();
    },
    dispose,
  };
}

/**
 * The book in a new tab, for a browser whose print dialog will not open from a frame, or to page through it full
 * size. Must run straight from a click, or the browser blocks the tab.
 */
export function openInNewTab(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  // The tab has read it by then; the address is only needed while it loads.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return opened != null;
}
