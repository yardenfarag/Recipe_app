# Recipe credits rollout

## Status (2026-10-27)

- **iOS:** purchases are live. Credit packs can be bought in the App Store build.
- **Android:** purchases are live. The app is in the Play production track, and build 30 (1.0.8) has the RevenueCat Android key. A Play purchase of `pinch_credits_30` was granted through the webhook on 2026-10-27. Accounts on Play Console's License testing list always get test orders ("test card, always approves", RevenueCat environment `SANDBOX`), even when installed from production. Use an account that isn't on that list to see a real charge.
- **Web:** no purchases. Buyers are sent to the mobile apps (see §1).
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
6. Schedule `select public.refund_stale_recipe_credits();` at least every 15 minutes.

The webhook accepts only `NON_RENEWING_PURCHASE` events and the three allowlisted product IDs. Supabase event and transaction uniqueness prevents duplicate grants.

## 3. Configure app builds

Set the public variables documented in `.env.example` in EAS production/preview environments. Set the matching web variables in GitHub Actions repository variables.

Real purchases require a development or production build. Expo Go can render the disabled/preview UI but cannot complete store purchases.

## 4. Sandbox matrix

For each iOS, Android, and web pack:

- Confirm localized price and credit count.
- Cancel checkout and verify no credit grant.
- Complete checkout and verify one ledger entry and the expected balance.
- Redeliver the same RevenueCat webhook and verify the balance does not change.
- Delay webhook delivery and verify the UI shows pending fulfillment, then updates after Sync purchases.
- Spend all 10 monthly free credits (`FREE_MONTHLY_EXTRACT_LIMIT`), verify the next extraction spends one purchased credit, and verify a failed extraction refunds it.
- Verify cached recipes remain free at a zero balance.
- Verify remix does not spend credits and blocks after 5 remixes on the same recipe.
- Verify purchased credits survive month boundaries while the free allowance resets.
- Verify Hebrew and Arabic purchase sheets remain usable in RTL.

## 5. Enable and monitor

After sandbox completion:

1. Set the public `EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED=true` for each build target.
2. Set Edge Function `CREDIT_PURCHASES_ENABLED=true`.
3. Release the new builds and web bundle.
4. Monitor `purchase_credit_grants`, `token_ledger`, stale reservations, failed webhooks, p95 provider cost, and video-fallback frequency.
5. Revisit pack prices after several hundred representative extractions.

For disputes, use the admin credit adjustment tool. Never grant credits from a client purchase callback.
