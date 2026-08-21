-- Per-recipe remix metering. Remix stays free and is capped at 5 successful
-- attempts per recipe (saved or unsaved preview), instead of a daily user cap.

create table if not exists public.recipe_remix_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  remix_count int not null default 0 check (remix_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

comment on table public.recipe_remix_usage is
  'Lifetime free remix count per saved recipe. Mutations go through reserve/refund RPCs.';

alter table public.recipe_remix_usage enable row level security;

create policy "Users read own recipe remix usage"
  on public.recipe_remix_usage for select
  using (auth.uid() = user_id);

create table if not exists public.preview_remix_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_url text not null,
  remix_count int not null default 0 check (remix_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, source_url),
  constraint preview_remix_usage_url_nonempty check (char_length(trim(source_url)) > 0)
);

comment on table public.preview_remix_usage is
  'Lifetime free remix count for unsaved extractions, keyed by source URL until save.';

alter table public.preview_remix_usage enable row level security;

create policy "Users read own preview remix usage"
  on public.preview_remix_usage for select
  using (auth.uid() = user_id);

create or replace function public.inherit_preview_remix_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preview_count int;
begin
  if new.original_url is null or char_length(trim(new.original_url)) = 0 then
    return new;
  end if;

  select remix_count into preview_count
  from public.preview_remix_usage
  where user_id = new.user_id
    and source_url = trim(new.original_url)
  for update;

  if preview_count is null or preview_count <= 0 then
    return new;
  end if;

  insert into public.recipe_remix_usage (user_id, recipe_id, remix_count, updated_at)
  values (new.user_id, new.id, preview_count, now())
  on conflict (user_id, recipe_id) do update
    set remix_count = greatest(public.recipe_remix_usage.remix_count, excluded.remix_count),
        updated_at = now();

  delete from public.preview_remix_usage
  where user_id = new.user_id
    and source_url = trim(new.original_url);

  return new;
end;
$$;

drop trigger if exists recipes_inherit_preview_remix_usage on public.recipes;
create trigger recipes_inherit_preview_remix_usage
  after insert on public.recipes
  for each row execute procedure public.inherit_preview_remix_usage();

create or replace function public.reserve_recipe_remix(
  p_user_id uuid,
  p_recipe_id uuid default null,
  p_source_url text default null,
  p_limit int default 5
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
  resolved_recipe_id uuid;
  normalized_url text;
begin
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  normalized_url := nullif(trim(coalesce(p_source_url, '')), '');
  if normalized_url is not null and char_length(normalized_url) > 2048 then
    raise exception 'invalid_source_url';
  end if;

  if p_recipe_id is not null then
    select id into resolved_recipe_id
    from public.recipes
    where id = p_recipe_id
      and user_id = p_user_id;
  end if;

  if resolved_recipe_id is null and normalized_url is not null then
    select id into resolved_recipe_id
    from public.recipes
    where user_id = p_user_id
      and original_url = normalized_url;
  end if;

  if resolved_recipe_id is not null then
    insert into public.recipe_remix_usage (user_id, recipe_id, remix_count, updated_at)
    values (p_user_id, resolved_recipe_id, 1, now())
    on conflict (user_id, recipe_id) do update
      set remix_count = public.recipe_remix_usage.remix_count + 1,
          updated_at = now()
      where public.recipe_remix_usage.remix_count < p_limit
    returning remix_count into new_count;
    return coalesce(new_count, -1);
  end if;

  if normalized_url is null then
    raise exception 'recipe_identity_required';
  end if;

  insert into public.preview_remix_usage (user_id, source_url, remix_count, updated_at)
  values (p_user_id, normalized_url, 1, now())
  on conflict (user_id, source_url) do update
    set remix_count = public.preview_remix_usage.remix_count + 1,
        updated_at = now()
    where public.preview_remix_usage.remix_count < p_limit
  returning remix_count into new_count;

  return coalesce(new_count, -1);
end;
$$;

create or replace function public.refund_recipe_remix(
  p_user_id uuid,
  p_recipe_id uuid default null,
  p_source_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_recipe_id uuid;
  normalized_url text;
begin
  normalized_url := nullif(trim(coalesce(p_source_url, '')), '');

  if p_recipe_id is not null then
    select id into resolved_recipe_id
    from public.recipes
    where id = p_recipe_id
      and user_id = p_user_id;
  end if;

  if resolved_recipe_id is null and normalized_url is not null then
    select id into resolved_recipe_id
    from public.recipes
    where user_id = p_user_id
      and original_url = normalized_url;
  end if;

  if resolved_recipe_id is not null then
    update public.recipe_remix_usage
    set remix_count = greatest(0, remix_count - 1), updated_at = now()
    where user_id = p_user_id
      and recipe_id = resolved_recipe_id
      and remix_count > 0;
    return found;
  end if;

  if normalized_url is null then
    return false;
  end if;

  update public.preview_remix_usage
  set remix_count = greatest(0, remix_count - 1), updated_at = now()
  where user_id = p_user_id
    and source_url = normalized_url
    and remix_count > 0;
  return found;
end;
$$;

revoke all on function public.inherit_preview_remix_usage() from public;
revoke all on function public.reserve_recipe_remix(uuid, uuid, text, int) from public;
revoke all on function public.refund_recipe_remix(uuid, uuid, text) from public;

grant execute on function public.reserve_recipe_remix(uuid, uuid, text, int) to service_role;
grant execute on function public.refund_recipe_remix(uuid, uuid, text) to service_role;
