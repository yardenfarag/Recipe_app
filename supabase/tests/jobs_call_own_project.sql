begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Jobs and support-email triggers call this project's functions (migration 20261127130000_jobs_call_own_project).

select is(
  (select count(*) from cron.job where command like '%supabase.co%'),
  0::bigint,
  'no scheduled job has a project address written into it'
);
select is(
  (select count(*) from cron.job
   where jobname in ('pinch-sweep-orphan-photos', 'pinch-welcome-emails', 'pinch-nudges', 'pinch-household-activity')
     and command like '%call_edge_function%'),
  4::bigint,
  'the four function jobs go through call_edge_function'
);
select ok(
  not has_function_privilege('authenticated', 'public.call_edge_function(text, text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.call_edge_function(text, text, text, jsonb)', 'execute'),
  'cooks cannot call call_edge_function'
);

-- Without project_url (a local stack), nothing is sent.
delete from vault.secrets where name = 'project_url';
select is(
  public.call_edge_function('welcome-emails', 'x-email-cron-secret', 'email_cron_secret'),
  null,
  'no project_url: no call'
);

select vault.create_secret('https://example.invalid/', 'project_url');

select is(
  public.call_edge_function('welcome-emails', 'x-email-cron-secret', 'no_such_secret'),
  null,
  'missing secret: no call'
);

select isnt(
  public.call_edge_function('welcome-emails', 'x-email-cron-secret', 'email_cron_secret'),
  null,
  'with project_url and the secret: a call is queued'
);
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://example.invalid/functions/v1/welcome-emails',
  'the call goes to project_url (trailing slash trimmed)'
);
select is(
  (select headers ->> 'x-email-cron-secret' from net.http_request_queue order by id desc limit 1),
  (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret'),
  'the secret is in its header'
);

-- The support trigger still queues its call, now to project_url.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-0000000c0185',
  'authenticated', 'authenticated', 'jobs@pinch.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles (id, email) values ('10000000-0000-4000-8000-0000000c0185', 'jobs@pinch.invalid')
on conflict (id) do nothing;
insert into public.feedback (user_id, message, platform) values ('10000000-0000-4000-8000-0000000c0185', 'hello', 'web');
select is(
  (select url from net.http_request_queue order by id desc limit 1),
  'https://example.invalid/functions/v1/support-email',
  'new feedback queues the support email at project_url'
);

select * from finish();
rollback;
