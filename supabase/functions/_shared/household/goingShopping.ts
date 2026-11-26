// "I'm going shopping" (ADR 034): tells the others in my household, once in 20 hours. household_going_shopping
// checks the wait, records the send and lists who to tell in one locked step, so two taps can't both send.
import { HttpError } from '../core/httpError.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import { fill } from '../email/copy.ts';
import { copyFor, LIST_PATH, nameOr, pushToRecipients, readRecipients, type SendPush } from './householdPush.ts';

/** Same as GOING_SHOPPING_COOLDOWN_HOURS in shared/types/household.ts (Deno can't import it). */
export const GOING_SHOPPING_COOLDOWN_HOURS = 20;

/** When it can be sent again after `sentAt`. */
export function goingShoppingAvailableAt(sentAt: string, hours = GOING_SHOPPING_COOLDOWN_HOURS): string {
  return new Date(new Date(sentAt).getTime() + hours * 3_600_000).toISOString();
}

export function goingShoppingText(locale: string | null, actorName: string): { title: string; body: string; url: string } {
  const { copy } = copyFor(locale);
  return {
    title: fill(copy.goingShoppingTitle, { name: nameOr(copy, actorName) }),
    body: copy.goingShoppingBody,
    url: LIST_PATH,
  };
}

type GoingShoppingRow =
  | { status: 'ok'; sent_at: string; actor_name: string; household_name: string; recipients: unknown }
  | { status: 'already_sent_today'; sent_at: string }
  | { status: 'alone' };

export interface GoingShoppingDeps {
  admin: Db;
  userId: string;
  sendPush: SendPush;
}

/** What a send with no phone reached costs: the wait is given back and the app says "Try again". */
function pushFailed(): HttpError {
  return new HttpError(502, 'push_failed', "Couldn't send it. Try again.");
}

/**
 * Sends it, or fails with 429 already_sent_today (with `available_at`), 409 alone, or 502 push_failed when phones
 * were there but none could be reached (Expo down); the 20-hour wait is given back then.
 * Returns `{ status: 'ok', notified, sent_at }`; `notified` counts the people a phone reached (0 when nobody else
 * has a phone with pushes on, which is still a send).
 */
export async function sendGoingShopping(
  deps: GoingShoppingDeps,
): Promise<{ status: 'ok'; notified: number; sent_at: string }> {
  const { data, error } = await deps.admin.rpc('household_going_shopping', {
    p_user_id: deps.userId,
    p_cooldown_hours: GOING_SHOPPING_COOLDOWN_HOURS,
  });
  if (error) throw error;
  const row = data as GoingShoppingRow | null;
  if (!row || row.status === 'alone') {
    throw new HttpError(409, 'alone', 'There is nobody else in your household yet.');
  }
  if (row.status === 'already_sent_today') {
    throw new HttpError(429, 'already_sent_today', 'You already told them today.', {
      sent_at: row.sent_at,
      available_at: goingShoppingAvailableAt(row.sent_at),
    });
  }
  const giveBack = async () => {
    const { error: undoError } = await deps.admin.rpc('household_going_shopping_failed', {
      p_user_id: deps.userId,
      p_sent_at: row.sent_at,
    });
    if (undoError) console.error('[household-going-shopping] could not give the send back', undoError);
  };
  let sent: { notified: number; failed: number };
  try {
    sent = await pushToRecipients(deps.admin, deps.sendPush, readRecipients(row.recipients), (recipient) =>
      goingShoppingText(recipient.locale, row.actor_name),
    );
  } catch (err) {
    console.error('[household-going-shopping] push failed', err);
    await giveBack();
    throw pushFailed();
  }
  if (sent.notified === 0 && sent.failed > 0) {
    await giveBack();
    throw pushFailed();
  }
  return { status: 'ok', notified: sent.notified, sent_at: new Date(row.sent_at).toISOString() };
}
