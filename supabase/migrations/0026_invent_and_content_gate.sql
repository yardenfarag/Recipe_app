-- How to cook this: invented recipes + content-gate daily caps.

alter table public.recipes
  drop constraint if exists recipes_extraction_source_check;

alter table public.recipes
  add constraint recipes_extraction_source_check
  check (
    extraction_source is null
    or extraction_source in (
      'description',
      'comments',
      'captions',
      'video',
      'web',
      'photo',
      'invented'
    )
  );

comment on column public.recipes.extraction_source is
  'Ladder rung for extracts, or invented for How to cook this guesses.';

alter table public.ai_usage_daily
  drop constraint if exists ai_usage_daily_action_check;

alter table public.ai_usage_daily
  add constraint ai_usage_daily_action_check
  check (action in ('substitution', 'translation', 'fridge_match', 'content_gate'));

alter table public.guest_ai_usage_daily
  drop constraint if exists guest_ai_usage_daily_action_check;

alter table public.guest_ai_usage_daily
  drop constraint if exists guest_ai_usage_daily_action_check1;

alter table public.guest_ai_usage_daily
  add constraint guest_ai_usage_daily_action_check
  check (action in ('fridge_match', 'content_gate'));

create or replace function public.reserve_daily_ai_usage(
  p_user_id uuid,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_action not in ('substitution', 'translation', 'fridge_match', 'content_gate') then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.ai_usage_daily (user_id, action, usage_date, usage_count, updated_at)
  values (p_user_id, p_action, p_usage_date, 1, now())
  on conflict (user_id, action, usage_date) do update
    set usage_count = public.ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

create or replace function public.reserve_guest_daily_ai_usage(
  p_install_id text,
  p_action text,
  p_usage_date date,
  p_limit int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_install_id text := trim(p_install_id);
  new_count int;
begin
  if p_install_id is null or length(normalized_install_id) < 8 then
    raise exception 'invalid_install_id';
  end if;
  if p_action not in ('fridge_match', 'content_gate') then
    raise exception 'invalid_action';
  end if;
  if p_usage_date is null then raise exception 'invalid_usage_date'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;

  insert into public.guest_ai_usage_daily (
    install_id, action, usage_date, usage_count, updated_at
  )
  values (normalized_install_id, p_action, p_usage_date, 1, now())
  on conflict (install_id, action, usage_date) do update
    set usage_count = public.guest_ai_usage_daily.usage_count + 1,
        updated_at = now()
    where public.guest_ai_usage_daily.usage_count < p_limit
  returning usage_count into new_count;

  return coalesce(new_count, -1);
end;
$$;
