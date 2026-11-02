begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Anonymous visitor writing analytics.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select lives_ok(
  $$ insert into public.product_events (guest_install_id, name, properties)
     values ('install-limits-1', 'recipe_saved', '{"platform":"web"}') $$,
  'anon can still log a normal event'
);

select throws_ok(
  $$ insert into public.product_events (guest_install_id, name, properties)
     values ('install-limits-1', 'recipe_saved',
             jsonb_build_object('note', repeat('x', 2000))) $$,
  '23514',
  null,
  'anon cannot log oversized event properties'
);

select throws_ok(
  $$ insert into public.product_events (guest_install_id, name, properties)
     values ('install-limits-1', 'recipe_saved', '["not", "an", "object"]') $$,
  '23514',
  null,
  'event properties must be an object'
);

reset role;

insert into public.product_events (guest_install_id, name, properties, created_at)
values
  ('install-old', 'recipe_saved', '{}', now() - interval '14 months'),
  ('install-new', 'recipe_saved', '{}', now() - interval '1 month');

insert into public.ai_usage_events (guest_install_id, action, status, error_message, metadata, total_cost_usd, created_at)
values
  ('install-old', 'extract', 'failed', 'url=https://example.com/old', '{"original_url":"https://example.com/old"}', 0.01, now() - interval '100 days'),
  ('install-new', 'extract', 'failed', 'url=https://example.com/new', '{"original_url":"https://example.com/new"}', 0.01, now() - interval '10 days');

select public.purge_expired_personal_data();

select is(
  (select count(*)::int from public.product_events where guest_install_id = 'install-old'),
  0, 'product events older than 13 months are deleted'
);
select is(
  (select count(*)::int from public.product_events where guest_install_id = 'install-new'),
  1, 'recent product events stay'
);
select ok(
  (select guest_install_id is null and error_message is null and metadata = '{}'::jsonb and total_cost_usd = 0.01
   from public.ai_usage_events where created_at < now() - interval '99 days' and action = 'extract' and status = 'failed'),
  'old usage events lose install id, URLs and error text but keep cost'
);
select ok(
  (select guest_install_id = 'install-new' from public.ai_usage_events
   where created_at > now() - interval '11 days' and error_message = 'url=https://example.com/new'),
  'recent usage events are untouched'
);
select ok(
  exists (select 1 from cron.job where jobname = 'pinch-purge-expired-personal-data' and active),
  'the purge job is scheduled'
);

select * from finish();
rollback;
