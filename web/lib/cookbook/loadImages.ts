/** Loads one picture and says whether it can be shown. Never throws. */
export type ImageLoader = (url: string, signal: AbortSignal) => Promise<boolean>;

/**
 * The browser's own image loading, as a page's `<img>` does it: no CORS needed (a picture from any site may be shown,
 * just not read), the work happens off the main thread, and the HTTP cache keeps it for the print page that follows.
 * A picture that takes longer than `timeoutMs` counts as missing.
 */
export function browserImageLoader(timeoutMs = 15_000): ImageLoader {
  return (url, signal) =>
    new Promise<boolean>((resolve) => {
      if (signal.aborted) {
        resolve(false);
        return;
      }
      const image = new Image();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        image.onload = null;
        image.onerror = null;
        resolve(ok);
      };
      const onAbort = () => {
        image.src = "";
        finish(false);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      signal.addEventListener("abort", onAbort);
      image.decoding = "async";
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      image.src = url;
    });
}

/**
 * Loads the pictures a few at a time (a browser opens about six connections per site anyway), reporting each one as
 * it finishes, so the screen can say "12 of 50" while the page stays responsive. Each answer lines up with `urls`:
 * true when that picture can be printed. Empty entries are false and cost nothing; a repeated URL loads once.
 */
export async function loadImages(
  urls: (string | null | undefined)[],
  options: {
    signal: AbortSignal;
    load?: ImageLoader;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<boolean[]> {
  const load = options.load ?? browserImageLoader();
  const unique = [...new Set(urls.map((url) => url?.trim()).filter((url): url is string => Boolean(url)))];
  const results = new Map<string, boolean>();
  const total = unique.length;
  let next = 0;
  let done = 0;
  options.onProgress?.(0, total);

  const worker = async () => {
    while (next < unique.length && !options.signal.aborted) {
      const url = unique[next++]!;
      results.set(url, await load(url, options.signal));
      done += 1;
      options.onProgress?.(done, total);
    }
  };
  const workers = Math.max(1, Math.min(options.concurrency ?? 6, unique.length));
  await Promise.all(Array.from({ length: workers }, worker));

  if (options.signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return urls.map((url) => results.get(url?.trim() ?? "") === true);
}
