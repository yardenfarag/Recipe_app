import { AppError, FetchError } from './errors.ts';

const BASE_URL = 'https://api.scrapecreators.com';
const REQUEST_TIMEOUT_MS = 15_000;

export function getScrapeCreatorsApiKey(): string {
  const key = Deno.env.get('SCRAPECREATORS_API_KEY');
  if (!key) {
    throw new AppError(
      'scrapecreators.ts',
      'SCRAPECREATORS_API_KEY is not configured',
    );
  }
  return key;
}

/** GET request to the ScrapeCreators REST API. */
export async function scrapeCreatorsGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = getScrapeCreatorsApiKey();
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    throw new FetchError('scrapecreators.ts: scrapeCreatorsGet', 'ScrapeCreators request failed', {
      path,
      timedOut: isTimeout,
      timeoutMs: REQUEST_TIMEOUT_MS,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 429) {
    throw new FetchError(
      'scrapecreators.ts: scrapeCreatorsGet',
      'Too many requests — try again in a minute',
      { path, status: 429 },
    );
  }

  const bodyText = await res.text();
  let data: unknown;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    throw new FetchError('scrapecreators.ts: scrapeCreatorsGet', 'ScrapeCreators returned invalid JSON', {
      path,
      status: res.status,
      body: bodyText.slice(0, 500),
    });
  }

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? `ScrapeCreators API error (${res.status})`;
    throw mapScraperHttpError(res.status, message, path);
  }

  return data as T;
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  for (const key of ['error', 'message', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

export function mapScraperHttpError(status: number, message: string, path: string): FetchError {
  const lower = message.toLowerCase();
  if (
    status === 404 ||
    lower.includes('not found') ||
    lower.includes('private') ||
    lower.includes('not publicly')
  ) {
    return new FetchError(
      'scrapecreators.ts',
      'This post is not publicly accessible',
      { path, status, reason: message },
    );
  }
  if (status === 429 || lower.includes('rate')) {
    return new FetchError(
      'scrapecreators.ts',
      'Too many requests — try again in a minute',
      { path, status, reason: message },
    );
  }
  return new FetchError('scrapecreators.ts', message, { path, status });
}

/** Strips WEBVTT markup from ScrapeCreators transcript responses. */
export function webVttToPlainText(vtt: string): string {
  return vtt
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed === 'WEBVTT') return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s-->/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

/** Reads the first string URL from nested url_list fields. */
export function firstUrlList(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const urlList = record.url_list;
  if (Array.isArray(urlList) && typeof urlList[0] === 'string') {
    return urlList[0];
  }
  return undefined;
}
