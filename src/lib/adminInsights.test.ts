import { describe, expect, it } from 'vitest';

import { summarizeFailures, summarizeInsights, type InsightEvent } from './adminInsights';

const events: InsightEvent[] = [
  {
    name: 'recipe_extracted',
    properties: { source: 'share', mode: 'extract' },
    created_at: '2026-09-24T12:00:00.000Z',
    user_id: 'user-1',
    guest_install_id: null,
  },
  {
    name: 'recipe_extracted',
    properties: { source: 'camera', mode: 'invent' },
    created_at: '2026-09-24T13:00:00.000Z',
    user_id: null,
    guest_install_id: 'install-1',
  },
  {
    name: 'recipe_saved',
    properties: { from: 'extract' },
    created_at: '2026-09-23T12:00:00.000Z',
    user_id: 'user-1',
    guest_install_id: null,
  },
  {
    name: 'paywall_viewed',
    properties: { trigger: 'out_of_credits' },
    created_at: '2026-09-22T12:00:00.000Z',
    user_id: 'user-2',
    guest_install_id: null,
  },
];

describe('summarizeInsights', () => {
  const summary = summarizeInsights(events, new Date('2026-09-24T18:00:00.000Z'));

  it('counts people without returning their ids', () => {
    expect(summary.signedInPeople).toBe(2);
    expect(summary.guestInstalls).toBe(1);
    expect(JSON.stringify(summary)).not.toContain('user-1');
    expect(JSON.stringify(summary)).not.toContain('install-1');
  });

  it('ranks snap sources and keeps a nameless recent table', () => {
    expect(summary.snapSources.map((item) => item.label)).toEqual(['camera', 'share']);
    expect(summary.recent[0]).toEqual({
      when: '2026-09-24T13:00:00.000Z',
      name: 'recipe_extracted',
      detail: 'camera · invent',
    });
    expect(summary.days).toHaveLength(14);
    expect(summarizeInsights(events, new Date('2026-09-24T18:00:00.000Z'), 7).days).toHaveLength(7);
    expect(summary.days.at(-1)?.count).toBe(2);
  });
});

describe('summarizeFailures', () => {
  it('groups failures by action and message', () => {
    const summary = summarizeFailures([
      {
        action: 'extract',
        status: 'failed',
        platform: 'tiktok',
        extraction_source: 'video',
        error_message: 'video_too_long',
        created_at: '2026-09-24T12:00:00.000Z',
      },
      {
        action: 'extract',
        status: 'ok',
        platform: 'web',
        extraction_source: 'web',
        error_message: null,
        created_at: '2026-09-24T11:00:00.000Z',
      },
    ]);
    expect(summary.failed).toBe(1);
    expect(summary.byAction).toEqual([{ label: 'extract', count: 1 }]);
    expect(summary.recent[0]?.where).toBe('tiktok · video');
  });
});
