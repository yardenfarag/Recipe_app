/**
 * A hosted page-reading service, for recipe sites that refuse our servers with a 403 (PIN-152).
 *
 * Some sites block requests by where they come from (data-centre addresses), not by how they look,
 * so no header fixes it. When the normal fetch gets a 403, webRecipe.ts asks the service once to
 * fetch the page from its own addresses. The service returns the page's raw HTML, so the recipe's
 * JSON-LD reaches the extractor exactly as a normal fetch would have.
 *
 * Every read is logged as its own `page_read` row in ai_usage_events, with its cost, whether or not
 * the import then succeeds.
 */

import { FetchError } from '../core/errors.ts';
import { assertPublicHttpUrl, readBodyCapped } from '../core/safeFetch.ts';
import { logUsageEvent } from '../core/usageLog.ts';
import type { Db } from '../core/supabaseAdmin.ts';

export type PageReaderProvider = 'firecrawl';

export interface PageRead {
  /** The page's HTML, or null when the site refused the service too. */
  html: string | null;
  /** The status the site answered the service with, when the service reports it. */
  siteStatus: number | null;
  /** Firecrawl credits billed. */
  units: number;
  costUsd: number;
}

export interface PageReader {
  provider: PageReaderProvider;
  read(url: string): Promise<PageRead>;
}

/** What one fallback read did, for the usage log. */
export interface PageReadEvent {
  provider: PageReaderProvider;
  host: string | null;
  /** ok: we got the page. blocked: the site refused the service too. error: the service failed. */
  status: 'ok' | 'blocked' | 'error';
  siteStatus: number | null;
  units: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

/** A service read waits this long. With the 18 s normal fetch before it, a page takes at most ~50 s. */
const READ_TIMEOUT_MS = 30_000;
/** The service's JSON wraps a page we cap at 2 MB elsewhere; this leaves room for the wrapper. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * Firecrawl, $ per credit. Pay-as-you-go on the Hobby plan is $5 per 1,000 credits; the free plan's
 * 1,000 credits a month cost nothing. Logged at the paid rate so the dashboard never under-counts.
 */
const FIRECRAWL_USD_PER_CREDIT = 0.005;

/** Firecrawl when its key is set, or null to leave the fallback off. */
export function configuredPageReader(env: (name: string) => string | undefined = Deno.env.get): PageReader | null {
  const key = env('FIRECRAWL_API_KEY')?.trim();
  return key ? firecrawlReader(key) : null;
}

/**
 * Firecrawl's scrape endpoint, raw HTML only. Its `auto` proxy retries a blocked page through its
 * enhanced proxies at no extra cost. Some publishers have opted out (allrecipes.com); Firecrawl
 * refuses those without charging, and the user gets the usual blocked message.
 */
export function firecrawlReader(apiKey: string): PageReader {
  return {
    provider: 'firecrawl',
    async read(url) {
      await assertPublicHttpUrl(url);
      const res = await callService('firecrawl', 'https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          formats: ['rawHtml'],
          onlyMainContent: false,
          proxy: 'auto',
          timeout: READ_TIMEOUT_MS - 2_000,
        }),
      });
      const data = record(res.data);
      const metadata = record(data?.metadata);
      const siteStatus = typeof metadata?.statusCode === 'number' ? metadata.statusCode : null;
      const rawHtml = typeof data?.rawHtml === 'string' ? data.rawHtml : '';
      // Firecrawl answers 200 even when the site refused it, and charges the credit either way.
      const loaded = siteStatus === null || (siteStatus >= 200 && siteStatus < 300) || siteStatus === 304;
      return {
        html: loaded && rawHtml.trim() && !looksLikeBlockPage(rawHtml) ? rawHtml : null,
        siteStatus,
        units: 1,
        costUsd: FIRECRAWL_USD_PER_CREDIT,
      };
    },
  };
}

/**
 * A bot check or "access denied" page that came back as a normal page. Only judged on pages without
 * a recipe in them, so a recipe that mentions "access denied" isn't thrown away.
 */
export function looksLikeBlockPage(html: string): boolean {
  if (/"@type"\s*:\s*(?:\[[^\]]*)?"Recipe"/i.test(html)) return false;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().toLowerCase() ?? '';
  return (
    /just a moment|attention required|access denied|forbidden|are you a robot|verify you are human|403/.test(title) ||
    /cf-browser-verification|challenge-platform|captcha-delivery\.com/i.test(html.slice(0, 20_000))
  );
}

/** Logs each fallback read in one user's request as a `page_read` row. The callback never throws. */
export function pageReadLogger(
  admin: Db | null,
  who: { userId: string | null; guestInstallId: string | null; forAction: 'extract' | 'invent' | 'repair' },
): (event: PageReadEvent) => Promise<void> {
  return async (event) => {
    try {
      await logUsageEvent(admin, {
        userId: who.userId,
        guestInstallId: who.userId ? null : who.guestInstallId,
        action: 'page_read',
        platform: 'web',
        status: event.status,
        pageReaderCostUsd: event.costUsd,
        durationMs: event.durationMs,
        errorMessage: event.error?.slice(0, 500) ?? null,
        metadata: {
          provider: event.provider,
          host: event.host,
          site_status: event.siteStatus,
          units: event.units,
          for_action: who.forAction,
        },
      });
    } catch (err) {
      console.error('[pageReader] usage log failed', err);
    }
  };
}

async function callService(
  provider: PageReaderProvider,
  endpoint: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const context = `pageReader.ts: ${provider}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { ...init, signal: controller.signal });
    const bytes = await readBodyCapped(res, MAX_RESPONSE_BYTES);
    if (bytes === null) throw new FetchError(context, 'Page reader response too large', { status: res.status });
    const text = new TextDecoder().decode(bytes);
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body is reported below with its status.
    }
    const json = record(body);
    if (!res.ok || !json || json.success === false) {
      const reason = json?.error ?? json?.message ?? text.slice(0, 200);
      throw new FetchError(context, 'Page reader request failed', {
        status: res.status,
        reason: typeof reason === 'string' ? reason.slice(0, 300) : String(reason),
      });
    }
    return json;
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(context, 'Page reader request failed', {
      timedOut: controller.signal.aborted,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
