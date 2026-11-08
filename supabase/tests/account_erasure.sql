begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000071',
    'authenticated', 'authenticated', 'erase-me@pinch.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000072',
    'authenticated', 'authenticated', 'keep-me@pinch.invalid', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.support_tickets (user_id, email, category, message)
values
  ('10000000-0000-4000-8000-000000000071', 'erase-me@pinch.invalid', 'other', 'my private issue'),
  ('10000000-0000-4000-8000-000000000072', 'keep-me@pinch.invalid', 'other', 'other user');

insert into public.feedback (user_id, message, platform)
values ('10000000-0000-4000-8000-000000000071', 'feedback text', 'ios');

insert into public.product_events (user_id, guest_install_id, name, properties)
values
  ('10000000-0000-4000-8000-000000000071', 'install-erase-1', 'recipe_saved', '{}'),
  (null, 'install-erase-1', 'recipe_saved', '{}'),
  (null, 'install-keep-1', 'recipe_saved', '{}');

insert into public.ai_usage_events (user_id, guest_install_id, action, status, error_message, metadata)
values ('10000000-0000-4000-8000-000000000071', 'install-erase-1', 'extract', 'failed',
        'url=https://example.com/private', '{"original_url":"https://example.com/private"}');

insert into public.purchase_webhook_failures (reason, app_user_id)
values ('test', '10000000-0000-4000-8000-000000000071');

set local role authenticated;
select throws_ok(
  $$ select public.erase_user_personal_data('10000000-0000-4000-8000-000000000071') $$,
  '42501',
  null,
  'clients cannot call erase_user_personal_data'
);
reset role;
select public.erase_user_personal_data('10000000-0000-4000-8000-000000000071');

select is(
  (select count(*)::int from public.support_tickets where user_id = '10000000-0000-4000-8000-000000000071'),
  0, 'support tickets are deleted'
);
select is(
  (select count(*)::int from public.support_tickets where user_id = '10000000-0000-4000-8000-000000000072'),
  1, 'other users'' support tickets stay'
);
select is(
  (select count(*)::int from public.feedback where user_id = '10000000-0000-4000-8000-000000000071'),
  0, 'feedback is deleted'
);
select is(
  (select count(*)::int from public.product_events where guest_install_id = 'install-erase-1'),
  0, 'product events are deleted, including guest-era events from the same install'
);
select is(
  (select count(*)::int from public.product_events where guest_install_id = 'install-keep-1'),
  1, 'other installs'' events stay'
);
select ok(
  (select bool_and(user_id is null and guest_install_id is null and error_message is null and metadata = '{}'::jsonb)
   from public.ai_usage_events where action = 'extract' and status = 'failed' and created_at > now() - interval '1 minute'),
  'usage events lose the user, install id, URLs and error text'
);
select is(
  (select count(*)::int from public.purchase_webhook_failures where app_user_id = '10000000-0000-4000-8000-000000000071'),
  0, 'webhook failures for the user are deleted'
);

-- Deleting a recipe revokes its share links.
insert into public.recipes (id, user_id, title, original_url, platform, ingredients, instructions)
values ('20000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000072',
        'Shared soup', 'https://example.com/shared-soup', 'web', '[{"name":"egg","quantity":1,"unit":""}]', '[{"step":1,"text":"Boil"}]');
insert into public.recipe_shares (token, created_by, source_recipe_id, snapshot)
values ('erasure-test-token', '10000000-0000-4000-8000-000000000072',
        '20000000-0000-4000-8000-000000000071', '{"title":"Shared soup"}');
delete from public.recipes where id = '20000000-0000-4000-8000-000000000071';

select ok(
  (select revoked_at is not null from public.recipe_shares where token = 'erasure-test-token'),
  'deleting a recipe revokes its share links'
);

select * from finish();
rollback;
