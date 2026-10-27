# Recipe credits rollout

## Status (2026-10-27)

- **iOS:** purchases are live. Credit packs can be bought in the App Store build.
- **Android:** purchases are live. The app is in the Play production track, and build 30 (1.0.8) has the RevenueCat Android key. A Play purchase of `pinch_credits_30` was granted through the webhook on 2026-10-27. Accounts on Play Console's License testing list always get test orders ("test card, always approves", RevenueCat environment `SANDBOX`), even when installed from production. Use an account that isn't on that list to see a real charge.
- **Web:** no purchases. Buyers are sent to the mobile apps (see §1).
- **Stale-credit refunds:** pg_cron runs `refund_stale_extraction_reservations()` every 10 minutes (job `pinch-refund-stale-extractions`, scheduled 2026-10-27).
- **Monitoring:** the admin screen's **Credits health** panel (Settings → Cost & support). See §5.
- **Sandbox matrix:** see §4. Rows still unchecked there are the last open item for PIN-58.
- **Free allowance:** 10 recipe credits per signed-in user per UTC month (`FREE_MONTHLY_EXTRACT_LIMIT`). Guests can't extract; the app and `extract-recipe` / `invent-recipe` require sign-up or log-in first.

Keep purchases disabled on a platform until every step below is complete for it.

## 1. Create store products

Create consumable products with the same IDs in App Store Connect, Google Play, and RevenueCat Billing:

- `pinch_credits_10` — 10 recipe credits
- `pinch_credits_30` — 30 recipe credits
- `pinch_credits_100` — 100 recipe credits

Initial price points are $1.99, $4.99, and $7.99 before store localization. Add all products to the current RevenueCat offering. Do not configure them as subscriptions.

Skip web purchase links. RevenueCat web checkout charges through Stripe, and Stripe does not support this account's country. Website buyers are sent to the mobile app. App Store and Play Store products do not use Stripe.

## 2. Deploy the backend while disabled

1. Apply `supabase/migrations/0018_recipe_credits.sql` and `0022_recipe_remix_usage.sql`.
2. Deploy `extract-recipe`, `transform-recipe`, and `revenuecat-webhook`.
3. Set Edge Function secrets:
   - `CREDIT_PURCHASES_ENABLED=false`
   - `REVENUECAT_WEBHOOK_AUTH=Bearer <long random value>`
4. Configure the RevenueCat webhook URL as:
   - `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
5. Set its Authorization header to the exact `REVENUECAT_WEBHOOK_AUTH` value.
6. Schedule stale-reservation refunds. Migration `20261027144253_credit_refund_schedule_and_health.sql` enables pg_cron and runs `select public.refund_stale_extraction_reservations();` every 10 minutes. It refunds signed-in credits and guest reservations held for more than 30 minutes, plus any failed extraction marked for compensation.

The webhook accepts only `NON_RENEWING_PURCHASE` events and the three allowlisted product IDs. Supabase event and transaction uniqueness prevents duplicate grants.

## 3. Configure app builds

Set the public variables documented in `.env.example` in EAS production/preview environments. Set the matching web variables in GitHub Actions repository variables.

Real purchases require a development or production build. Expo Go can render the disabled/preview UI but cannot complete store purchases.

## 4. Sandbox matrix

Run on iOS and Android (web has no purchases). Use a sandbox Apple ID on iOS and a License testing account on Play, so nothing is charged. Check the result in the admin screen's **Credits health** panel and the user's balance. Tick a box and add the date when a row passes on that platform.

| Check | iOS | Android |
|---|---|---|
| Each pack (10 / 30 / 100) shows the local price and the right credit count | [ ] | [ ] |
| Cancelling checkout grants nothing | [ ] | [ ] |
| Completing checkout adds one grant and the expected balance | [ ] | [ ] |
| Redelivering the same webhook from RevenueCat doesn't change the balance | [ ] | [ ] |
| With a delayed webhook the app shows pending, then updates after **Sync purchases** | [ ] | [ ] |
| After the 10 free monthly credits (`FREE_MONTHLY_EXTRACT_LIMIT`), the next extraction spends a purchased credit | [ ] | [ ] |
| A failed extraction refunds its credit | [ ] | [ ] |
| Cached recipes stay free at a zero balance | [ ] | [ ] |
| Remix spends no credits and blocks after 5 remixes of the same recipe | [ ] | [ ] |
| Purchased credits survive the month boundary while the free allowance resets | [ ] | [ ] |
| Hebrew and Arabic purchase sheets are usable in RTL | [ ] | [ ] |

Already confirmed in production: App Store and Play purchases of all three packs were granted through the webhook (8 grants by 2026-10-27).

The month-boundary row can't be forced from the phone. Check it on the first purchase after a UTC month starts: `profiles.token_balance` keeps purchased credits, and `extract_usage_monthly` starts a new row.

## 5. Enable and monitor

After sandbox completion:

1. Set the public `EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED=true` for each build target.
2. Set Edge Function `CREDIT_PURCHASES_ENABLED=true`.
3. Release the new builds and web bundle.
4. Monitor with the **Credits health** panel on the admin screen (Settings → Cost & support). It reads `admin_credit_health()` (admins only) and shows purchases by store and environment, stuck and refunded reservations, refund-job runs, webhook failures, extraction failure rate, video-fallback share, and p95 extraction cost. Problems show in red at the top. The webhook records every failed delivery in `purchase_webhook_failures`; a failure counts as unresolved until a later delivery grants the same transaction.
5. Revisit pack prices after several hundred representative extractions.

For disputes, use the admin credit adjustment tool. Never grant credits from a client purchase callback.
