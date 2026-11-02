/**
 * Recipe-credit health report from the `admin_credit_health` RPC, and the
 * thresholds that flag a problem on the admin screen.
 */

export interface CreditHealth {
  generatedAt: string;
  purchases: {
    last24h: number;
    last7d: number;
    credits7d: number;
    lastAt: string | null;
    byStore7d: { store: string; environment: string; count: number }[];
  };
  reservations: { stuck: number; pendingCompensation: number; refunded24h: number };
  webhook: {
    failures24h: number;
    failures7d: number;
    unresolved7d: number;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  };
  refundJob: {
    scheduled: boolean;
    lastRunAt: string | null;
    lastStatus: string | null;
    failedRuns24h: number;
  };
  extraction: { count7d: number; failed7d: number; video7d: number; p95CostUsd7d: number };
}

/**
 * Above this p95 cost per extraction, pack prices need a second look. The
 * cheapest credit sells for about $0.14 after store fees ($1.99 / 10, less 30%).
 */
export const P95_COST_WARN_USD = 0.05;
/** The refund job runs every 10 minutes; a gap this long means it stopped. */
const REFUND_JOB_STALE_MS = 30 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function parseCreditHealth(raw: unknown): CreditHealth {
  const root = record(raw);
  const purchases = record(root.purchases);
  const reservations = record(root.reservations);
  const webhook = record(root.webhook);
  const refundJob = record(root.refund_job);
  const extraction = record(root.extraction);
  const byStore = Array.isArray(purchases.by_store_7d) ? purchases.by_store_7d : [];

  return {
    generatedAt: str(root.generated_at) ?? new Date().toISOString(),
    purchases: {
      last24h: num(purchases.last_24h),
      last7d: num(purchases.last_7d),
      credits7d: num(purchases.credits_7d),
      lastAt: str(purchases.last_at),
      byStore7d: byStore.map((row) => {
        const r = record(row);
        return {
          store: str(r.store) ?? 'unknown',
          environment: str(r.environment) ?? 'unknown',
          count: num(r.count),
        };
      }),
    },
    reservations: {
      stuck: num(reservations.stuck),
      pendingCompensation: num(reservations.pending_compensation),
      refunded24h: num(reservations.refunded_24h),
    },
    webhook: {
      failures24h: num(webhook.failures_24h),
      failures7d: num(webhook.failures_7d),
      unresolved7d: num(webhook.unresolved_7d),
      lastFailureAt: str(webhook.last_failure_at),
      lastFailureReason: str(webhook.last_failure_reason),
    },
    refundJob: {
      scheduled: refundJob.scheduled === true,
      lastRunAt: str(refundJob.last_run_at),
      lastStatus: str(refundJob.last_status),
      failedRuns24h: num(refundJob.failed_runs_24h),
    },
    extraction: {
      count7d: num(extraction.count_7d),
      failed7d: num(extraction.failed_7d),
      video7d: num(extraction.video_7d),
      p95CostUsd7d: num(extraction.p95_cost_usd_7d),
    },
  };
}

/** Plain-English problems worth acting on; empty when everything looks fine. */
export function creditHealthWarnings(health: CreditHealth): string[] {
  const warnings: string[] = [];
  const { reservations, webhook, refundJob, extraction } = health;

  if (!refundJob.scheduled) {
    warnings.push('The stale-credit refund job is not scheduled.');
  } else if (refundJob.lastStatus === 'failed' || refundJob.failedRuns24h > 0) {
    warnings.push(`The refund job failed ${refundJob.failedRuns24h} time(s) in the last 24 hours.`);
  } else if (
    !refundJob.lastRunAt ||
    Date.parse(health.generatedAt) - Date.parse(refundJob.lastRunAt) > REFUND_JOB_STALE_MS
  ) {
    warnings.push('The refund job has not run in the last 30 minutes.');
  }
  if (reservations.stuck > 0) {
    warnings.push(`${reservations.stuck} credit(s) are held by extractions older than 30 minutes.`);
  }
  if (reservations.pendingCompensation > 0) {
    warnings.push(`${reservations.pendingCompensation} failed extraction(s) are waiting for a refund.`);
  }
  if (webhook.unresolved7d > 0) {
    warnings.push(
      `${webhook.unresolved7d} purchase webhook failure(s) this week never led to a grant. Check RevenueCat.`,
    );
  }
  if (extraction.p95CostUsd7d > P95_COST_WARN_USD) {
    warnings.push(
      `p95 extraction cost is $${extraction.p95CostUsd7d.toFixed(3)}, above $${P95_COST_WARN_USD.toFixed(2)}.`,
    );
  }
  return warnings;
}
