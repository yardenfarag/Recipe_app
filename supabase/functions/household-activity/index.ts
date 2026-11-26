import { handler } from '../_shared/core/handler.ts';
import { runHouseholdActivity } from '../_shared/household/activity.ts';
import { sendPush } from '../_shared/nudges/expoPush.ts';

/**
 * POST from the cron job (migration 20261126130000_households: every minute while a push is due,
 * x-email-cron-secret) -> { status: 'ok', events, notified, failed }
 *
 * Sends the queued household pushes (ADR 034): items added to the shared list, one push per burst, and people
 * joining, leaving or being removed. Each goes out once. Secret: EXPO_ACCESS_TOKEN only if Expo's enhanced push
 * security is on.
 */
handler(
  {
    name: 'household-activity',
    auth: 'secret',
    secret: { header: 'x-email-cron-secret', rpc: 'email_cron_secret_matches' },
    // Called by pg_net only.
    cors: false,
    body: 'none',
  },
  async ({ admin }) => {
    const result = await runHouseholdActivity({ admin, sendPush: (messages) => sendPush(messages) });
    return { status: 'ok', ...result };
  },
);
