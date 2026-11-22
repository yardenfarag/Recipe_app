import { describe, expect, it } from 'vitest';

import type { Dashboard, DashboardWindow } from './adminDashboard';
import {
  buildHints,
  formatMs,
  gateRouteName,
  gateTextMisses,
  platformFailureRows,
  type DashboardInsights,
  type GateWindow,
  type TranslationWindow,
} from './adminHints';

function windowOf(overrides: Partial<DashboardWindow> = {}): DashboardWindow {
  return {
    new_users: 0,
    active_users: 0,
    active_guests: 0,
    recipes_saved: 0,
    extractions: 0,
    extraction_failures: 0,
    ai_cost_usd: 0,
    ai_cost_admin_usd: 0,
    ai_cost_guest_usd: 0,
    purchases: 0,
    credits_sold: 0,
    revenue_usd: 0,
    ...overrides,
  };
}

function dashboard(over: {
  current?: Partial<DashboardWindow>;
  previous?: Partial<DashboardWindow>;
  funnel?: Partial<Dashboard['funnel']>;
  cost_by_action?: Dashboard['cost_by_action'];
  cost_by_model?: Dashboard['cost_by_model'];
} = {}): Dashboard {
  return {
    range: { days: 30, tz: 'UTC', since: '', previous_since: '', include_admins: false, generated_at: '' },
    kpis: { current: windowOf(over.current), previous: windowOf(over.previous) },
    totals: { users: 0, recipes: 0, ai_cost_usd: 0, revenue_usd: 0, credits_sold: 0, paying_users: 0 },
    daily: [],
    cost_by_action: over.cost_by_action ?? [],
    cost_by_model: over.cost_by_model ?? [],
    scrape_cost_usd: 0,
    recipes_by_platform: [],
    recipes_by_source: [],
    heard_about: [],
    traffic: [],
    funnel: { signed_up: 0, extracted: 0, saved: 0, saved_3: 0, purchased: 0, ...over.funnel },
    people: [],
    recent_recipes: [],
    recent_failures: [],
    purchases: [],
  };
}

const emptyGate: GateWindow = { decisions: 0, confident: 0, low_confidence: 0, errors: 0, cost_usd: 0, routes: [] };
const emptyTranslations: TranslationWindow = { calls: 0, ok: 0, failed: 0, cost_usd: 0, people: 0, languages: [] };

function insights(over: Partial<{
  platforms: DashboardInsights['extract_by_platform'];
  gate: Partial<GateWindow>;
  translations: Partial<TranslationWindow>;
  previousTranslations: Partial<TranslationWindow>;
  latency: DashboardInsights['latency'];
}> = {}): DashboardInsights {
  return {
    range: { days: 30, tz: 'UTC', since: '', previous_since: '' },
    extract_by_platform: over.platforms ?? { current: [], previous: [] },
    gate: { current: { ...emptyGate, ...over.gate }, previous: emptyGate },
    translations: {
      current: { ...emptyTranslations, ...over.translations },
      previous: { ...emptyTranslations, ...over.previousTranslations },
    },
    latency: over.latency ?? [],
  };
}

const ids = (hints: { id: string }[]) => hints.map((h) => h.id);

describe('buildHints', () => {
  it('says nothing about a quiet period', () => {
    expect(buildHints(dashboard(), insights())).toEqual([]);
  });

  it('flags AI cost above revenue', () => {
    const hints = buildHints(dashboard({ current: { ai_cost_usd: 12, revenue_usd: 4.99 } }), null);
    expect(hints[0]).toMatchObject({ id: 'margin', tone: 'fix', tab: 'costs' });
  });

  it('compares cost per extraction with the period before, both ways', () => {
    const up = dashboard({
      current: { ai_cost_usd: 0.5, revenue_usd: 10, extractions: 20 },
      previous: { ai_cost_usd: 0.2, extractions: 20 },
    });
    expect(ids(buildHints(up, null))).toContain('cost-per-extraction-up');
    const down = dashboard({
      current: { ai_cost_usd: 0.1, revenue_usd: 10, extractions: 20 },
      previous: { ai_cost_usd: 0.4, extractions: 20 },
    });
    expect(buildHints(down, null).find((h) => h.id === 'cost-per-extraction-down')?.tone).toBe('good');
  });

  it('needs enough extractions before comparing', () => {
    const few = dashboard({ current: { ai_cost_usd: 0.5, revenue_usd: 10, extractions: 3 }, previous: { ai_cost_usd: 0.1, extractions: 3 } });
    expect(ids(buildHints(few, null))).not.toContain('cost-per-extraction-up');
  });

  it('flags a platform whose imports fail often, with its previous rate', () => {
    const hints = buildHints(
      dashboard(),
      insights({
        platforms: {
          current: [
            { platform: 'instagram', attempts: 20, recipes: 13, failed: 7, video: 2, cost_usd: 1, p95_ms: 20000 },
            { platform: 'tiktok', attempts: 40, recipes: 38, failed: 2, video: 4, cost_usd: 1, p95_ms: 20000 },
            { platform: 'youtube', attempts: 4, recipes: 1, failed: 3, video: 0, cost_usd: 0.1, p95_ms: 1000 },
          ],
          previous: [{ platform: 'instagram', attempts: 10, recipes: 9, failed: 1, video: 0, cost_usd: 0.5, p95_ms: 1000 }],
        },
      }),
    );
    const instagram = hints.find((h) => h.id === 'platform-failures-instagram');
    expect(instagram).toMatchObject({ tone: 'fix', tab: 'failures', title: 'Instagram imports fail 35% of the time' });
    expect(instagram?.detail).toContain('10% the period before');
    // TikTok is fine and YouTube has too few attempts to judge.
    expect(ids(hints)).not.toContain('platform-failures-tiktok');
    expect(ids(hints)).not.toContain('platform-failures-youtube');
  });

  it('flags a platform that mostly needs the video step', () => {
    const hints = buildHints(
      dashboard(),
      insights({
        platforms: {
          current: [{ platform: 'instagram', attempts: 12, recipes: 12, failed: 0, video: 9, cost_usd: 0.6, p95_ms: 30000 }],
          previous: [],
        },
      }),
    );
    expect(hints.find((h) => h.id === 'video-share-instagram')?.title).toBe('75% of Instagram recipes needed the video');
  });

  it('checks the Jev gate: wrong text calls, unsure posts and errors', () => {
    const hints = buildHints(
      dashboard(),
      insights({
        gate: {
          decisions: 40,
          confident: 20,
          low_confidence: 18,
          errors: 3,
          routes: [{ route: 'full_recipe_in_text', extracts: 15, recipes: 14, video: 3, failed: 1, blocked: 0 }],
        },
      }),
    );
    expect(ids(hints)).toEqual(expect.arrayContaining(['gate-text-misses', 'gate-unsure', 'gate-errors']));
    expect(hints.find((h) => h.id === 'gate-text-misses')?.title).toContain('27%');
  });

  it('does not report gate or translation failures twice', () => {
    const data = dashboard({
      cost_by_action: [
        { action: 'extract_gate', events: 40, failed: 10, cost_usd: 0.01, scrape_cost_usd: 0 },
        { action: 'translate', events: 20, failed: 5, cost_usd: 0.1, scrape_cost_usd: 0 },
      ],
    });
    const withInsights = buildHints(data, insights({ gate: { decisions: 40, errors: 10 }, translations: { calls: 20, failed: 5 } }));
    expect(ids(withInsights).filter((id) => id.includes('gate') || id.includes('translat'))).toEqual(['gate-errors', 'translation-failures']);
    // Without the insights call, the per-feature rule still catches them.
    expect(ids(buildHints(data, null))).toEqual(['feature-failures-extract_gate', 'feature-failures-translate']);
  });

  it('notices translation volume doubling', () => {
    const hints = buildHints(dashboard(), insights({ translations: { calls: 30, ok: 30 }, previousTranslations: { calls: 12 } }));
    expect(ids(hints)).toEqual(['translation-volume']);
  });

  it('flags slow features with a higher bar for extraction', () => {
    const hints = buildHints(
      dashboard(),
      insights({
        latency: [
          { action: 'extract', calls: 30, p50_ms: 15000, p95_ms: 50000 },
          { action: 'remix', calls: 12, p50_ms: 6000, p95_ms: 25000 },
        ],
      }),
    );
    expect(ids(hints)).toEqual(['slow-remix']);
  });

  it('flags low activation and engaged people who never paid', () => {
    const hints = buildHints(dashboard({ funnel: { signed_up: 30, extracted: 9, saved: 9, saved_3: 10, purchased: 0 } }), null);
    expect(ids(hints)).toEqual(['activation', 'no-purchases']);
  });

  it('puts fixes first, then things to watch, then good news', () => {
    const hints = buildHints(
      dashboard({
        current: { ai_cost_usd: 2, revenue_usd: 1, extractions: 30, extraction_failures: 1, ai_cost_guest_usd: 1 },
        previous: { ai_cost_usd: 6, extractions: 30, extraction_failures: 10 },
      }),
      null,
    );
    expect(hints.map((h) => h.tone)).toEqual(['fix', 'watch', 'good', 'good']);
  });
});

describe('platformFailureRows', () => {
  it('adds rates and orders by attempts', () => {
    const rows = platformFailureRows(
      insights({
        platforms: {
          current: [
            { platform: 'web', attempts: 2, recipes: 2, failed: 0, video: 0, cost_usd: 0.01, p95_ms: 900 },
            { platform: 'tiktok', attempts: 10, recipes: 8, failed: 2, video: 4, cost_usd: 0.4, p95_ms: null },
          ],
          previous: [],
        },
      }),
    );
    expect(rows.map((r) => r.platform)).toEqual(['tiktok', 'web']);
    expect(rows[0]).toMatchObject({ failureRate: 0.2, videoShare: 0.5, costPerRecipe: 0.05, previousRate: null, p95Ms: null });
  });
});

describe('helpers', () => {
  it('counts gate text misses', () => {
    expect(gateTextMisses({ ...emptyGate, routes: [] })).toEqual({ extracts: 0, misses: 0, rate: 0 });
    expect(
      gateTextMisses({ ...emptyGate, routes: [{ route: 'full_recipe_in_text', extracts: 10, recipes: 9, video: 2, failed: 1, blocked: 0 }] }).rate,
    ).toBeCloseTo(0.3);
  });

  it('formats durations and route names', () => {
    expect(formatMs(null)).toBe('—');
    expect(formatMs(850)).toBe('850 ms');
    expect(formatMs(4200)).toBe('4.2 s');
    expect(formatMs(48000)).toBe('48 s');
    expect(formatMs(126000)).toBe('2.1 min');
    expect(gateRouteName('needs_video')).toBe('Needs the video');
    expect(gateRouteName('something_new')).toBe('something new');
  });
});
