export type InsightEvent = {
  name: string;
  properties: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  guest_install_id: string | null;
};

export type InsightFailure = {
  action: string;
  status: string;
  platform: string | null;
  extraction_source: string | null;
  error_message: string | null;
  created_at: string;
};

export type RankedItem = { label: string; count: number };

export type InsightSummary = {
  events: number;
  signedInPeople: number;
  guestInstalls: number;
  byName: RankedItem[];
  snapSources: RankedItem[];
  snapModes: RankedItem[];
  saveFrom: RankedItem[];
  paywallTriggers: RankedItem[];
  locales: RankedItem[];
  days: RankedItem[];
  recent: { when: string; name: string; detail: string }[];
};

export const INSIGHT_RANGES = [7, 14, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/** Start of the window, inclusive, in local time. */
export function insightSince(days: number, now = new Date()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.toISOString();
}

function prop(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  return typeof value === 'string' && value.trim() ? value : 'unknown';
}

function tally(rows: { label: string }[]): RankedItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function eventDayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dayKey(date);
}

function detailFor(event: InsightEvent): string {
  const properties = event.properties ?? {};
  if (event.name === 'recipe_extracted') {
    return `${prop(properties, 'source')} · ${prop(properties, 'mode')}`;
  }
  if (event.name === 'recipe_saved') return prop(properties, 'from');
  if (event.name === 'paywall_viewed') return prop(properties, 'trigger');
  if (event.name === 'onboarding_completed') {
    return `${prop(properties, 'locale')} · ${prop(properties, 'platform')}`;
  }
  return '';
}

/** Counts and rankings for the admin insights page. Identifiers are not returned. */
export function summarizeInsights(
  events: InsightEvent[],
  now = new Date(),
  dayCount: InsightRange | number = 14,
): InsightSummary {
  const signedIn = new Set<string>();
  const guests = new Set<string>();
  for (const event of events) {
    if (event.user_id) signedIn.add(event.user_id);
    else if (event.guest_install_id) guests.add(event.guest_install_id);
  }

  const extracted = events.filter((event) => event.name === 'recipe_extracted');
  const saved = events.filter((event) => event.name === 'recipe_saved');
  const paywall = events.filter((event) => event.name === 'paywall_viewed');
  const onboarded = events.filter((event) => event.name === 'onboarding_completed');

  const days: RankedItem[] = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const label = dayKey(date);
    const count = events.filter((event) => eventDayKey(event.created_at) === label).length;
    days.push({ label, count });
  }

  return {
    events: events.length,
    signedInPeople: signedIn.size,
    guestInstalls: guests.size,
    byName: tally(events.map((event) => ({ label: event.name }))),
    snapSources: tally(extracted.map((event) => ({ label: prop(event.properties ?? {}, 'source') }))),
    snapModes: tally(extracted.map((event) => ({ label: prop(event.properties ?? {}, 'mode') }))),
    saveFrom: tally(saved.map((event) => ({ label: prop(event.properties ?? {}, 'from') }))),
    paywallTriggers: tally(
      paywall.map((event) => ({ label: prop(event.properties ?? {}, 'trigger') })),
    ),
    locales: tally(onboarded.map((event) => ({ label: prop(event.properties ?? {}, 'locale') }))),
    days,
    recent: [...events]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 80)
      .map((event) => ({
        when: event.created_at,
        name: event.name,
        detail: detailFor(event),
      })),
  };
}

export type FailureGroup = RankedItem & { sample: string };

export function summarizeFailures(rows: InsightFailure[]): {
  failed: number;
  byAction: RankedItem[];
  byMessage: FailureGroup[];
  recent: { when: string; action: string; status: string; where: string; message: string }[];
} {
  const failed = rows.filter(
    (row) => row.status === 'failed' || row.status === 'error' || Boolean(row.error_message),
  );
  return {
    failed: failed.length,
    byAction: tally(failed.map((row) => ({ label: row.action }))),
    byMessage: tally(
      failed.map((row) => ({
        label: row.error_message?.trim() || row.status,
      })),
    )
      .slice(0, 8)
      .map((item) => ({ ...item, sample: item.label })),
    recent: [...failed]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 40)
      .map((row) => ({
        when: row.created_at,
        action: row.action,
        status: row.status,
        where: [row.platform, row.extraction_source].filter(Boolean).join(' · ') || '—',
        message: row.error_message?.trim() || '—',
      })),
  };
}
