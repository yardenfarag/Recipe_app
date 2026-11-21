/**
 * What the admin dashboard pages work out from the RPC data before drawing it: names for platforms and stores,
 * the country tally, one person's timeline, and the axis maths for the bar charts. Pure, and used by the mobile
 * app's web dashboard (src/components/admin/dashboard) and the new web app (web/components/admin) alike, so both
 * show the same numbers.
 */
import { countryName, featureName, humanize, num, type UserDetail } from './adminDashboard';

const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  web: 'Website',
  photo: 'Photo',
  unknown: 'Unknown',
};

/** Where a recipe came from, in words ("tiktok" → "TikTok"). */
export function platformName(platform: string | null | undefined): string {
  if (!platform) return 'Unknown';
  return PLATFORM_NAMES[platform] ?? humanize(platform);
}

/** The store a credit pack was bought in. */
export function purchaseStoreName(provider: string): string {
  if (provider === 'revenuecat') return 'App store';
  if (provider === 'polar') return 'Web (Polar)';
  return provider;
}

/** "pinch_credits_25" → "25 credits". */
export function packName(productId: string): string {
  return `${productId.replace('pinch_credits_', '')} credits`;
}

/** How many people per country, most first. A missing country counts as "Unknown". */
export function countryCounts(codes: (string | null)[]): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const name = code ? countryName(code) : 'Unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export type TimelineItem = { when: string; text: string; detail?: string; tone?: 'bad' | 'muted'; cost?: number };

const FAILED = new Set(['error', 'failed', 'metering_error']);

function eventDetail(properties: Record<string, unknown>): string {
  const parts = ['source', 'from', 'trigger', 'mode', 'platform', 'locale', 'outcome', 'action']
    .map((key) => properties?.[key])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return parts.join(' · ');
}

/** Everything one person did (saves, AI runs, app events, purchases), newest first, at most 200. */
export function buildUserTimeline(detail: UserDetail): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of detail.recipes) {
    items.push({ when: r.created_at, text: `Saved “${r.title || 'Untitled recipe'}”`, detail: platformName(r.platform) });
  }
  for (const e of detail.ai_events) {
    const failed = FAILED.has(e.status);
    items.push({
      when: e.created_at,
      text: `${featureName(e.action)} · ${humanize(e.status).toLowerCase()}`,
      detail: [e.platform ? platformName(e.platform) : null, e.message].filter(Boolean).join(' · ') || undefined,
      tone: failed ? 'bad' : e.action.endsWith('_gate') ? 'muted' : undefined,
      cost: num(e.cost_usd),
    });
  }
  for (const e of detail.events) {
    items.push({ when: e.created_at, text: humanize(e.name), detail: eventDetail(e.properties) || undefined, tone: 'muted' });
  }
  for (const p of detail.purchases) {
    items.push({
      when: p.created_at,
      text: `Bought ${p.credits} credits${p.revoked_at ? ' (refunded)' : ''}`,
      detail: p.provider === 'revenuecat' ? 'App store' : p.provider,
    });
  }
  return items.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 200);
}

export type UserDetailStats = {
  extractions: number;
  failures: number;
  cost: number;
  /** Credits from packs that were not refunded. */
  bought: number;
  lastActive: string | null;
  cooked: number;
};

/** The figures at the top of a person's details. `timeline` is buildUserTimeline's result. */
export function userDetailStats(detail: UserDetail, timeline: readonly TimelineItem[]): UserDetailStats {
  return {
    extractions: num(detail.profile.extractions),
    failures: num(detail.profile.failures),
    cost: num(detail.profile.ai_cost_usd),
    bought: detail.purchases.filter((p) => !p.revoked_at).reduce((sum, p) => sum + num(p.credits), 0),
    lastActive: timeline[0]?.when ?? null,
    cooked: detail.recipes.filter((r) => r.last_cooked_at).length,
  };
}

/** A round axis maximum and evenly spaced ticks for it. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

/** SVG path for a bar with 4px rounded top corners, anchored flat on the baseline. */
export function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
