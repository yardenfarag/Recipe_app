begin;

create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'credits-test@pinch.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

select ok(
  exists (
    select 1 from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'signup creates a credit profile'
);

update public.profiles
set token_balance = 2
where id = '10000000-0000-4000-8000-000000000001';

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-free-01',
    15
  )->>'source',
  'monthly_free',
  'monthly free credits are spent first'
);

select public.reserve_recipe_credit(
  '10000000-0000-4000-8000-000000000001',
  '2099-01',
  'request-free-' || lpad(n::text, 2, '0'),
  15
)
from generate_series(2, 15) n;

select is(
  (select extract_count from public.extract_usage_monthly
   where user_id = '10000000-0000-4000-8000-000000000001'
     and year_month = '2099-01'),
  15,
  'free monthly usage reaches the limit'
);

create temporary table paid_reservation as
select public.reserve_recipe_credit(
  '10000000-0000-4000-8000-000000000001',
  '2099-01',
  'request-paid-01',
  15
) as result;

select is(
  (select result->>'source' from paid_reservation),
  'purchased',
  'purchased credit is used after free credits'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'paid balance is decremented'
);

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-paid-01',
    15
  )->>'reservation_id',
  (select result->>'reservation_id' from paid_reservation),
  'an idempotency key returns the same reservation'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'idempotent retry does not charge again'
);

select ok(
  public.refund_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from paid_reservation),
    'test_failure'
  ),
  'reserved paid credit can be refunded'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  2,
  'refund restores paid balance'
);
select ok(
  public.refund_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from paid_reservation),
    'duplicate_refund'
  ),
  'duplicate refund is idempotent'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  2,
  'duplicate refund does not add balance'
);
select is(
  public.reopen_refunded_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-paid-01',
    15
  )->>'status',
  'reserved',
  'an unknown-outcome retry can reopen a refunded signed-in reservation'
);
select is(
  (select token_balance from public.profiles
   where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'reopening a refunded paid reservation charges once'
);
select ok(
  public.refund_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from paid_reservation),
    'retry_cleanup'
  ),
  'a reopened reservation remains refundable'
);

update public.profiles
set token_balance = 0
where id = '10000000-0000-4000-8000-000000000001';

select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-01',
    'request-empty-01',
    15
  )->>'code',
  'insufficient_credits',
  'empty pools are rejected'
);
select is(
  public.reserve_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    '2099-02',
    'request-next-month',
    15
  )->>'source',
  'monthly_free',
  'a new UTC month has a fresh free pool'
);

select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-001',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'verified purchase grants credits'
);
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-001',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'duplicate webhook event does not grant twice'
);
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000001',
    10,
    'revenuecat',
    'event-002',
    'transaction-001',
    'pinch_credits_10',
    '{}'::jsonb
  ),
  10,
  'duplicate store transaction does not grant twice'
);
select is(
  (select count(*)::int from public.purchase_credit_grants
   where user_id = '10000000-0000-4000-8000-000000000001'),
  1,
  'only one purchase grant is recorded'
);

create temporary table finalize_failure_reservation as
select public.reserve_recipe_credit(
  '10000000-0000-4000-8000-000000000001',
  '2099-04',
  'request-finalize-failure',
  15
) as result;

select ok(
  public.finalize_recipe_credit(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from finalize_failure_reservation)
  ),
  'recipe credit can reach finalized state'
);
select ok(
  public.refund_recipe_credit_after_finalize_failure(
    '10000000-0000-4000-8000-000000000001',
    (select (result->>'reservation_id')::uuid from finalize_failure_reservation)
  ),
  'a failed finalize response refunds even if the transaction committed'
);
select is(
  (select extract_count from public.extract_usage_monthly
   where user_id = '10000000-0000-4000-8000-000000000001'
     and year_month = '2099-04'),
  0,
  'finalize-failure refund restores signed-in allowance'
);

create temporary table guest_reservation as
select public.reserve_guest_extraction_v2(
  'install-billing-test',
  'guest-request-01',
  3
) as result;

select ok(
  (select result->>'reservation_id' from guest_reservation) is not null,
  'guest extraction is reserved before work'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-billing-test'),
  1,
  'guest reservation increments usage'
);
select is(
  public.reserve_guest_extraction_v2(
    'install-billing-test',
    'guest-request-01',
    3
  )->>'reservation_id',
  (select result->>'reservation_id' from guest_reservation),
  'guest retry returns the same reservation'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-billing-test'),
  1,
  'guest retry does not bypass or double-charge quota'
);
select ok(
  public.refund_guest_extraction(
    'install-billing-test',
    (select (result->>'reservation_id')::uuid from guest_reservation),
    'test_failure'
  ),
  'failed guest reservation can be refunded'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-billing-test'),
  0,
  'guest refund restores quota'
);
select is(
  public.reserve_guest_extraction_v2(
    'install-billing-test',
    'guest-request-01',
    3
  )->>'status',
  'reserved',
  'a refunded unknown-outcome retry can reserve again'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-billing-test'),
  1,
  're-reserving a refunded guest request charges once'
);
select ok(
  public.finalize_guest_extraction(
    'install-billing-test',
    (select (result->>'reservation_id')::uuid from guest_reservation)
  ),
  'successful guest reservation finalizes'
);
select isnt(
  public.refund_guest_extraction(
    'install-billing-test',
    (select (result->>'reservation_id')::uuid from guest_reservation),
    'too_late'
  ),
  true,
  'finalized guest usage cannot be refunded'
);
select ok(
  public.refund_guest_extraction(
    'install-billing-test',
    (select (result->>'reservation_id')::uuid from guest_reservation),
    'finalize_failed'
  ),
  'failed guest finalize response refunds a committed reservation'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-billing-test'),
  0,
  'guest finalize-failure refund restores quota'
);

select is(
  public.reserve_daily_ai_usage(
    '10000000-0000-4000-8000-000000000001',
    'translation',
    '2099-01-01',
    2
  ),
  1,
  'daily AI usage starts at one'
);
select is(
  public.reserve_daily_ai_usage(
    '10000000-0000-4000-8000-000000000001',
    'translation',
    '2099-01-01',
    2
  ),
  2,
  'daily AI usage reaches its limit'
);
select is(
  public.reserve_daily_ai_usage(
    '10000000-0000-4000-8000-000000000001',
    'translation',
    '2099-01-01',
    2
  ),
  -1,
  'daily AI usage blocks over-limit work'
);
select ok(
  public.refund_daily_ai_usage(
    '10000000-0000-4000-8000-000000000001',
    'translation',
    '2099-01-01'
  ),
  'failed daily AI usage can be refunded'
);
select is(
  public.reserve_daily_ai_usage(
    '10000000-0000-4000-8000-000000000001',
    'translation',
    '2099-01-01',
    2
  ),
  2,
  'refunded daily AI allowance is reusable'
);

select is(
  public.reserve_daily_remix(
    '10000000-0000-4000-8000-000000000001',
    '2099-01-01',
    5
  ),
  1,
  'daily remix usage is reserved'
);
select ok(
  public.refund_daily_remix(
    '10000000-0000-4000-8000-000000000001',
    '2099-01-01'
  ),
  'failed remix reservation can be refunded'
);
select is(
  (select remix_count from public.remix_usage_daily
   where user_id = '10000000-0000-4000-8000-000000000001'
     and usage_date = '2099-01-01'),
  0,
  'remix refund restores daily allowance'
);

insert into public.recipes (id, user_id, title, original_url)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Soup',
    'https://example.com/soup'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Salad',
    'https://example.com/salad'
  );

select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    null,
    5
  ),
  1,
  'saved-recipe remix usage is reserved'
);
select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    null,
    'https://example.com/soup',
    5
  ),
  2,
  'source URL remix counts against the saved recipe'
);

select public.reserve_recipe_remix(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  null,
  5
)
from generate_series(3, 5);

select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    null,
    5
  ),
  -1,
  'sixth remix on the same recipe is blocked'
);
select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    null,
    5
  ),
  1,
  'a different recipe has its own remix allowance'
);
select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    null,
    'https://example.com/unsaved-pasta',
    5
  ),
  1,
  'preview remix usage is reserved by source URL'
);
select ok(
  public.refund_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    null
  ),
  'failed recipe remix reservation can be refunded'
);
select is(
  (select remix_count from public.recipe_remix_usage
   where user_id = '10000000-0000-4000-8000-000000000001'
     and recipe_id = '20000000-0000-4000-8000-000000000002'),
  0,
  'recipe remix refund restores the per-recipe allowance'
);

select public.reserve_recipe_remix(
  '10000000-0000-4000-8000-000000000001',
  null,
  'https://example.com/unsaved-pasta',
  5
)
from generate_series(2, 5);

insert into public.recipes (id, user_id, title, original_url)
values (
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'Pasta',
  'https://example.com/unsaved-pasta'
);

select is(
  (select remix_count from public.recipe_remix_usage
   where recipe_id = '20000000-0000-4000-8000-000000000003'),
  5,
  'saving a preview inherits remix usage from the source URL'
);
select is(
  (select count(*)::int from public.preview_remix_usage
   where user_id = '10000000-0000-4000-8000-000000000001'
     and source_url = 'https://example.com/unsaved-pasta'),
  0,
  'inherited preview remix usage is removed after save'
);
select is(
  public.reserve_recipe_remix(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    null,
    5
  ),
  -1,
  'inherited remix usage still enforces the per-recipe cap'
);

select * from finish();
rollback;
