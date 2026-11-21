begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- PIN-153: payment webhooks aren't ordered. A refund delivered before its purchase must stop
-- the later grant, and a purchase for a deleted account must fail in a way the webhook can tell
-- apart from a temporary error.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000153',
  'authenticated', 'authenticated', 'refund-test@pinch.invalid', '',
  now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

-- Refund first ---------------------------------------------------------------
select is(
  public.revoke_purchased_credits('polar', 'order-refunded-first', 'evt-refund-1', '{}'::jsonb),
  null,
  'a refund with no grant yet returns null'
);
select is(
  (select count(*)::int from public.purchase_refund_markers
   where provider = 'polar' and transaction_id = 'order-refunded-first'),
  1,
  'and leaves a marker'
);
select lives_ok(
  $$ select public.revoke_purchased_credits('polar', 'order-refunded-first', 'evt-refund-1b', '{}'::jsonb) $$,
  'a repeated refund delivery is harmless'
);
select throws_ok(
  $$ select public.grant_purchased_credits(
       '10000000-0000-4000-8000-000000000153', 30, 'polar', 'evt-paid-1',
       'order-refunded-first', 'pinch_credits_30', '{}'::jsonb) $$,
  'P0001', 'purchase_refunded',
  'the purchase that arrives after its refund is refused'
);
select is(
  (select token_balance from public.profiles where id = '10000000-0000-4000-8000-000000000153'),
  0,
  'no credits were added'
);
select is(
  (select count(*)::int from public.purchase_credit_grants where transaction_id = 'order-refunded-first'),
  0,
  'and no grant was recorded'
);

-- The marker is per provider: the same id from another provider is a different purchase.
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000153', 10, 'revenuecat', 'evt-rc-1',
    'order-refunded-first', 'pinch_credits_10', '{}'::jsonb),
  10,
  'another provider''s purchase with the same id is granted'
);

-- The usual order still works -------------------------------------------------
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000153', 30, 'polar', 'evt-paid-2',
    'order-normal', 'pinch_credits_30', '{}'::jsonb),
  40,
  'a purchase is granted'
);
select is(
  public.revoke_purchased_credits('polar', 'order-normal', 'evt-refund-2', '{}'::jsonb),
  10,
  'its refund takes the pack back'
);
select is(
  (select count(*)::int from public.purchase_refund_markers where transaction_id = 'order-normal'),
  0,
  'a refund that found its grant leaves no marker'
);
select is(
  public.grant_purchased_credits(
    '10000000-0000-4000-8000-000000000153', 30, 'polar', 'evt-paid-2',
    'order-normal', 'pinch_credits_30', '{}'::jsonb),
  10,
  'a repeated delivery of the refunded purchase does not grant it again'
);

-- A deleted account -------------------------------------------------------------
select throws_ok(
  $$ select public.grant_purchased_credits(
       '99999999-0000-4000-8000-000000000153', 10, 'polar', 'evt-paid-3',
       'order-deleted-account', 'pinch_credits_10', '{}'::jsonb) $$,
  '23503', null,
  'a purchase for an account that no longer exists fails with a foreign key error'
);

-- Access --------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.purchase_refund_markers', 'select')
  and not has_table_privilege('authenticated', 'public.purchase_refund_markers', 'select')
  and not has_table_privilege('authenticated', 'public.purchase_refund_markers', 'insert'),
  'clients cannot read or write refund markers'
);
select ok(
  not has_function_privilege('anon', 'public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_purchased_credits(text, text, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.grant_purchased_credits(uuid, int, text, text, text, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_purchased_credits(text, text, text, jsonb)', 'execute'),
  'only the service role can grant or revoke purchased credits'
);

select * from finish();
rollback;
