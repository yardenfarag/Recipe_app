// The queued household pushes (ADR 034, table household_activity): items someone added to the shared list (one
// push per burst, once they've been quiet for 2 minutes), and people joining, leaving or being removed. A cron job
// calls the household-activity function every minute while something is due; household_activity_claim hands out
// each push once and marks it sent, so a second run, or two runs at once, never repeat one.
import type { Db } from '../core/supabaseAdmin.ts';
import { fill } from '../email/copy.ts';
import { plural } from './householdCopy.ts';
import {
  copyFor,
  HOUSEHOLD_PATH,
  LIST_PATH,
  nameOr,
  pushToRecipients,
  readRecipients,
  type PushRecipient,
  type PushText,
  type SendPush,
} from './householdPush.ts';

export type ActivityKind = 'list_added' | 'member_joined' | 'member_left' | 'member_removed';

export interface ActivityRow {
  id: number;
  kind: ActivityKind | string;
  household_name: string;
  actor_name: string;
  subject_name: string;
  item_count: number;
  recipients: unknown;
}

/** What one recipient's phone shows for an activity row, or null for a kind this code doesn't know. */
export function activityText(row: ActivityRow, recipient: Pick<PushRecipient, 'role' | 'locale'>): PushText | null {
  const { locale, copy } = copyFor(recipient.locale);
  const title = row.household_name.trim() || copy.fallbackTitle;
  const household = row.household_name.trim() || copy.fallbackTitle;
  switch (row.kind) {
    case 'list_added': {
      const count = Math.max(1, Math.trunc(row.item_count));
      const body = fill(plural(locale, copy.listAdded, count), { name: nameOr(copy, row.actor_name), count });
      return { title, body, url: LIST_PATH };
    }
    case 'member_joined':
      return { title, body: fill(copy.memberJoined, { name: nameOr(copy, row.actor_name) }), url: HOUSEHOLD_PATH };
    case 'member_left':
      return { title, body: fill(copy.memberLeft, { name: nameOr(copy, row.actor_name) }), url: HOUSEHOLD_PATH };
    case 'member_removed':
      if (recipient.role === 'subject') {
        return { title, body: fill(copy.removedYou, { household }), url: HOUSEHOLD_PATH };
      }
      return { title, body: fill(copy.memberRemoved, { name: nameOr(copy, row.subject_name) }), url: HOUSEHOLD_PATH };
    default:
      return null;
  }
}

export interface ActivityDeps {
  admin: Db;
  sendPush: SendPush;
  limit?: number;
}

export interface ActivityRunResult {
  /** Activity rows handed out this run. */
  events: number;
  /** People at least one phone reached. */
  notified: number;
  /** Phones that failed (not counting uninstalled ones). */
  failed: number;
}

/** One cron run: every push that is due, each once. */
export async function runHouseholdActivity(deps: ActivityDeps): Promise<ActivityRunResult> {
  const { data, error } = await deps.admin.rpc('household_activity_claim', { p_limit: deps.limit ?? 50 });
  if (error) throw error;
  const totals: ActivityRunResult = { events: 0, notified: 0, failed: 0 };
  for (const row of (data ?? []) as ActivityRow[]) {
    totals.events++;
    try {
      const sent = await pushToRecipients(deps.admin, deps.sendPush, readRecipients(row.recipients), (recipient) =>
        activityText(row, recipient),
      );
      totals.notified += sent.notified;
      totals.failed += sent.failed;
    } catch (err) {
      // Already marked sent: one lost push beats a repeated one.
      totals.failed++;
      console.error('[household-activity] push failed', row.id, err);
    }
  }
  return totals;
}
