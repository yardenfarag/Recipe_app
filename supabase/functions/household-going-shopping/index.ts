import { handler } from '../_shared/core/handler.ts';
import { sendGoingShopping } from '../_shared/household/goingShopping.ts';
import { sendPush } from '../_shared/nudges/expoPush.ts';

/**
 * POST {} -> { status: 'ok', notified, sent_at }
 *
 * "I'm going shopping" (ADR 034): a push to the others in my household, "Dana is going shopping. Anything to add?",
 * once in 20 hours. Failures: 409 alone (nobody else in the household), 429 already_sent_today (with sent_at and
 * available_at), 502 push_failed (no phone could be reached; the wait is given back, so trying again works).
 * Secret: EXPO_ACCESS_TOKEN only if Expo's enhanced push security is on.
 */
handler(
  { name: 'household-going-shopping', auth: 'user', maxBodyBytes: 1_000, emptyBody: {} },
  ({ user, admin }) => sendGoingShopping({ admin, userId: user.id, sendPush: (messages) => sendPush(messages) }),
);
