-- Limit what anyone can write to product_events, and stop keeping personal
-- data in event tables forever (PIN-54).

-- The anon insert policy accepts any guest_install_id, so the only bound on a
-- flood of fake events was the name allowlist. Real events are objects under
-- 130 bytes; cap them at 1 KB so free text and payloads can't ride along.
alter table public.product_events
  drop constraint if exists product_events_properties_size;
alter table public.product_events
  add constraint product_events_properties_size
  check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 1024);

-- Retention. The privacy policy keeps only anonymized usage events.
-- * product_events (install id, country): deleted after 13 months.
-- * ai_usage_events: after 90 days, drop the install id, URLs and error text.
--   Cost and token counts stay for reporting.
-- * purchase_webhook_failures: deleted after 90 days (admin report reads 7).
create or replace function public.purge_expired_personal_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.product_events where created_at < now() - interval '13 months';

  update public.ai_usage_events
  set guest_install_id = null, metadata = '{}'::jsonb, error_message = null
  where created_at < now() - interval '90 days'
    and (guest_install_id is not null or metadata <> '{}'::jsonb or error_message is not null);

  delete from public.purchase_webhook_failures where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.purge_expired_personal_data() from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data() to service_role;

do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-purge-expired-personal-data') then
    perform cron.unschedule('pinch-purge-expired-personal-data');
  end if;
  perform cron.schedule(
    'pinch-purge-expired-personal-data',
    '17 3 * * *',
    'select public.purge_expired_personal_data();'
  );
end;
$schedule$;
