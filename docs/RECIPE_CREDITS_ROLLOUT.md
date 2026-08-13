# Recipe credits rollout

Keep purchases disabled until every step below is complete.

## 1. Create store products

Create consumable products with the same IDs in App Store Connect, Google Play, and RevenueCat Billing:

- `pinch_credits_10` — 10 recipe credits
- `pinch_credits_30` — 30 recipe credits
- `pinch_credits_100` — 100 recipe credits

Initial price points are $1.99, $4.99, and $12.99 before store localization. Add all products to the current RevenueCat offering. Do not configure them as subscriptions.

For web, create one identified Web Purchase Link per pack. Pinch appends the signed-in Supabase user UUID as `app_user_id`.

## 2. Deploy the backend while disabled

1. Apply `supabase/migrations/0018_recipe_credits.sql`.
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
- Spend all 15 monthly credits, verify the next extraction spends one purchased credit, and verify a failed extraction refunds it.
- Verify cached recipes remain free at a zero balance.
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
