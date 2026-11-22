import { describe, expect, it } from 'vitest';

import type { UserDetail } from './adminDashboard';
import {
  barPath,
  buildUserTimeline,
  countryCounts,
  niceTicks,
  packName,
  platformName,
  purchaseStoreName,
  userDetailStats,
} from './adminDashboardView';

function detail(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    profile: {
      id: 'u1',
      email: 'cook@example.com',
      created_at: '2026-11-01T10:00:00Z',
      is_admin: false,
      token_balance: 4,
      plan: 'free',
      ai_cost_usd: 0.25,
      extractions: 3,
      failures: 1,
      free_extracts_this_month: 2,
    },
    recipes: [],
    ai_events: [],
    events: [],
    purchases: [],
    ledger: [],
    ...overrides,
  };
}

describe('names', () => {
  it('names platforms, stores and packs', () => {
    expect(platformName('tiktok')).toBe('TikTok');
    expect(platformName('web')).toBe('Website');
    expect(platformName(null)).toBe('Unknown');
    expect(platformName('some_thing')).toBe('Some thing');
    expect(purchaseStoreName('revenuecat')).toBe('App store');
    expect(purchaseStoreName('polar')).toBe('Web (Polar)');
    expect(purchaseStoreName('other')).toBe('other');
    expect(packName('pinch_credits_25')).toBe('25 credits');
  });
});

describe('countryCounts', () => {
  it('counts people per country, most first, with missing ones as Unknown', () => {
    expect(countryCounts(['IL', 'US', 'IL', null])).toEqual([
      { label: 'Israel', value: 2 },
      { label: 'United States', value: 1 },
      { label: 'Unknown', value: 1 },
    ]);
  });
});

describe('buildUserTimeline', () => {
  it('merges everything newest first and marks failures and background checks', () => {
    const items = buildUserTimeline(
      detail({
        recipes: [
          {
            id: 'r1',
            title: 'Soup',
            platform: 'tiktok',
            url: null,
            image_url: null,
            source: null,
            status: 'full',
            created_at: '2026-11-03T10:00:00Z',
            is_favorite: false,
            last_cooked_at: null,
            ingredients: 4,
            minutes: 20,
            calories: null,
          },
        ],
        ai_events: [
          { created_at: '2026-11-04T10:00:00Z', action: 'extract', status: 'failed', platform: 'tiktok', source: null, cost_usd: 0.01, duration_ms: 100, message: 'Timed out' },
          { created_at: '2026-11-02T10:00:00Z', action: 'content_gate', status: 'success', platform: null, source: null, cost_usd: 0, duration_ms: 10, message: null },
        ],
        events: [{ created_at: '2026-11-05T10:00:00Z', name: 'paywall_viewed', properties: { trigger: 'snap', ignored: 3 }, country: 'IL' }],
        purchases: [{ created_at: '2026-11-01T12:00:00Z', product_id: 'pinch_credits_10', provider: 'revenuecat', credits: 10, revoked_at: '2026-11-02T00:00:00Z' }],
      }),
    );
    expect(items.map((i) => i.text)).toEqual([
      'Paywall viewed',
      'Recipe extraction · failed',
      'Saved “Soup”',
      'Food check · success',
      'Bought 10 credits (refunded)',
    ]);
    expect(items[0]).toMatchObject({ tone: 'muted', detail: 'snap' });
    expect(items[1]).toMatchObject({ tone: 'bad', detail: 'TikTok · Timed out', cost: 0.01 });
    expect(items[3].tone).toBe('muted');
    expect(items[4].detail).toBe('App store');
  });

  it('keeps the newest 200', () => {
    const events = Array.from({ length: 250 }, (_, i) => ({
      created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      name: 'screen',
      properties: {},
      country: null,
    }));
    const items = buildUserTimeline(detail({ events }));
    expect(items).toHaveLength(200);
    expect(items[0].when).toBe(events[249].created_at);
  });
});

describe('userDetailStats', () => {
  it('leaves refunded packs out of credits bought and takes last active from the timeline', () => {
    const d = detail({
      purchases: [
        { created_at: '2026-11-01T12:00:00Z', product_id: 'pinch_credits_10', provider: 'polar', credits: 10, revoked_at: null },
        { created_at: '2026-11-02T12:00:00Z', product_id: 'pinch_credits_25', provider: 'polar', credits: 25, revoked_at: '2026-11-03T00:00:00Z' },
      ],
    });
    const stats = userDetailStats(d, buildUserTimeline(d));
    expect(stats).toEqual({ extractions: 3, failures: 1, cost: 0.25, bought: 10, lastActive: '2026-11-02T12:00:00Z', cooked: 0 });
  });
});

describe('chart maths', () => {
  it('rounds the axis up to a nice number', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(37)).toEqual([0, 10, 20, 30, 40]);
  });

  it('draws a bar with rounded top corners', () => {
    expect(barPath(0, 10, 10, 20)).toBe('M0,30V14Q0,10 4,10H6Q10,10 10,14V30Z');
  });
});
