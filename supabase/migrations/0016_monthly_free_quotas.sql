-- Free tier becomes 15 extracts / calendar month (UTC).
-- Plus monthly cap becomes 100. Both tiers meter via extract_usage_monthly.
-- Legacy profiles.free_extracts_used is no longer incremented.

comment on column public.profiles.free_extracts_used is
  'Deprecated lifetime free counter (pre-0016). Metering uses extract_usage_monthly.';

comment on table public.extract_usage_monthly is
  'Per-user extract counts keyed by UTC YYYY-MM for Free (15) and Plus (100) monthly caps.';

create or replace function public.reserve_monthly_extract(
  p_user_id uuid,
  p_year_month text,
  p_limit int default 100
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_year_month is null or p_year_month !~ '^\d{4}-\d{2}$' then
    raise exception 'invalid_year_month';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_limit';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.extract_usage_monthly (user_id, year_month, extract_count, updated_at)
  values (p_user_id, p_year_month, 1, now())
  on conflict (user_id, year_month) do update
    set extract_count = public.extract_usage_monthly.extract_count + 1,
        updated_at = now()
    where public.extract_usage_monthly.extract_count < p_limit
  returning extract_count into new_count;

  if new_count is null then
    return -1;
  end if;

  return new_count;
end;
$$;
