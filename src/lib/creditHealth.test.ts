import { describe, expect, it } from 'vitest';

import { creditHealthWarnings, parseCreditHealth } from './creditHealth';

const healthy = {
  generated_at: '2026-10-27T15:00:00Z',
  purchases: {
    last_24h: 1,
    last_7d: 3,
    credits_7d: 140,
    last_at: '2026-10-27T14:15:33Z',
    by_store_7d: [{ store: 'PLAY_STORE', environment: 'PRODUCTION', count: 1 }],
  },
  reservations: { stuck: 0, pending_compensation: 0, refunded_24h: 2 },
  webhook: {
    failures_24h: 0,
    failures_7d: 0,
    unresolved_7d: 0,
    last_failure_at: null,
    last_failure_reason: null,
  },
  refund_job: {
    scheduled: true,
    last_run_at: '2026-10-27T14:50:00Z',
    last_status: 'succeeded',
    failed_runs_24h: 0,
  },
  extraction: { count_7d: 40, failed_7d: 3, video_7d: 5, p95_cost_usd_7d: 0.012 },
};

describe('parseCreditHealth', () => {
  it('maps the RPC report to camelCase numbers', () => {
    const health = parseCreditHealth(healthy);
    expect(health.purchases).toEqual({
      last24h: 1,
      last7d: 3,
      credits7d: 140,
      lastAt: '2026-10-27T14:15:33Z',
      byStore7d: [{ store: 'PLAY_STORE', environment: 'PRODUCTION', count: 1 }],
    });
    expect(health.extraction).toEqual({ count7d: 40, failed7d: 3, video7d: 5, p95CostUsd7d: 0.012 });
    expect(health.refundJob.scheduled).toBe(true);
  });

  it('fills zeros for a report with missing sections', () => {
    const health = parseCreditHealth({ generated_at: '2026-10-27T15:00:00Z' });
    expect(health.reservations).toEqual({ stuck: 0, pendingCompensation: 0, refunded24h: 0 });
    expect(health.purchases.byStore7d).toEqual([]);
    expect(health.refundJob.scheduled).toBe(false);
  });
});

describe('creditHealthWarnings', () => {
  it('is empty when everything is fine', () => {
    expect(creditHealthWarnings(parseCreditHealth(healthy))).toEqual([]);
  });

  it('flags an unscheduled refund job', () => {
    const health = parseCreditHealth({ ...healthy, refund_job: { scheduled: false } });
    expect(creditHealthWarnings(health)).toEqual(['The stale-credit refund job is not scheduled.']);
  });

  it('flags a refund job that stopped running', () => {
    const health = parseCreditHealth({
      ...healthy,
      refund_job: { ...healthy.refund_job, last_run_at: '2026-10-27T14:00:00Z' },
    });
    expect(creditHealthWarnings(health)).toEqual([
      'The refund job has not run in the last 30 minutes.',
    ]);
  });

  it('flags stuck credits, unresolved webhook failures and high cost', () => {
    const health = parseCreditHealth({
      ...healthy,
      reservations: { stuck: 2, pending_compensation: 1, refunded_24h: 0 },
      webhook: { ...healthy.webhook, failures_7d: 3, unresolved_7d: 1 },
      extraction: { ...healthy.extraction, p95_cost_usd_7d: 0.08 },
    });
    expect(creditHealthWarnings(health)).toEqual([
      '2 credit(s) are held by extractions older than 30 minutes.',
      '1 failed extraction(s) are waiting for a refund.',
      '1 purchase webhook failure(s) this week never led to a grant. Check RevenueCat.',
      'p95 extraction cost is $0.080, above $0.05.',
    ]);
  });
});
