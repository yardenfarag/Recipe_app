begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'recovery-test@pinch.invalid',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

create temporary table stale_signed as
select public.reserve_recipe_credit(
  '20000000-0000-4000-8000-000000000002',
  '2099-10',
  'stale-signed-request',
  15
) as result;

select ok(
  (select result->>'reservation_id' from stale_signed) is not null,
  'signed-in reservation is created'
);

update public.credit_reservations
set created_at = '2000-01-01'
where id = (select (result->>'reservation_id')::uuid from stale_signed);

select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'signed_in_refunded',
  '1',
  'stale cleanup refunds signed-in reservations'
);
select is(
  (select status from public.credit_reservations
   where id = (select (result->>'reservation_id')::uuid from stale_signed)),
  'refunded',
  'signed-in stale reservation remains observably refunded'
);
select is(
  (select extract_count from public.extract_usage_monthly
   where user_id = '20000000-0000-4000-8000-000000000002'
     and year_month = '2099-10'),
  0,
  'signed-in stale refund restores allowance'
);

create temporary table stale_guest as
select public.reserve_guest_extraction_v2(
  'install-recovery-test',
  'stale-guest-request',
  3
) as result;

select ok(
  (select result->>'reservation_id' from stale_guest) is not null,
  'guest reservation is created'
);

update public.guest_extraction_reservations
set created_at = '2000-01-01'
where id = (select (result->>'reservation_id')::uuid from stale_guest);

select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'guest_refunded',
  '1',
  'stale cleanup refunds guest reservations'
);
select is(
  (select status from public.guest_extraction_reservations
   where id = (select (result->>'reservation_id')::uuid from stale_guest)),
  'refunded',
  'guest stale reservation remains observably refunded'
);
select is(
  (select extract_count from public.guest_usage where install_id = 'install-recovery-test'),
  0,
  'guest stale refund restores allowance'
);

create temporary table finalized_signed as
select public.reserve_recipe_credit(
  '20000000-0000-4000-8000-000000000002',
  '2099-11',
  'finalized-signed-request',
  15
) as result;

select ok(
  public.finalize_recipe_credit(
    '20000000-0000-4000-8000-000000000002',
    (select (result->>'reservation_id')::uuid from finalized_signed)
  ) and public.mark_recipe_credit_compensation_pending(
    '20000000-0000-4000-8000-000000000002',
    (select (result->>'reservation_id')::uuid from finalized_signed),
    'finalize_failed',
    'simulated transport failure'
  ),
  'finalized signed-in compensation is marked pending'
);
select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'signed_in_refunded',
  '1',
  'cleanup recovers pending finalized signed-in compensation'
);

create temporary table finalized_guest as
select public.reserve_guest_extraction_v2(
  'install-recovery-test',
  'finalized-guest-request',
  3
) as result;

select ok(
  public.finalize_guest_extraction(
    'install-recovery-test',
    (select (result->>'reservation_id')::uuid from finalized_guest)
  ) and public.mark_guest_extraction_compensation_pending(
    'install-recovery-test',
    (select (result->>'reservation_id')::uuid from finalized_guest),
    'finalize_failed',
    'simulated transport failure'
  ),
  'finalized guest compensation is marked pending'
);
select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'guest_refunded',
  '1',
  'cleanup recovers pending finalized guest compensation'
);

select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'signed_in_refunded',
  '0',
  'signed-in cleanup is idempotent'
);
select is(
  public.refund_stale_extraction_reservations('2001-01-01')->>'guest_refunded',
  '0',
  'guest cleanup is idempotent'
);

select * from finish();
rollback;
