-- A way to take a Cooking Hub card off the public site (PIN-153).
--
-- Every full extraction becomes a public page at pinch-app.io/r/<slug>. Until now the only way
-- to remove a bad one was to delete the row, and the next import of the same link published it
-- again. A hidden card stays in the table, so the link stays blocked, but nobody can read it:
--   * extract-recipe sets hidden_at when its moderation check rejects a recipe;
--   * an admin hides or restores a card with admin_set_recipe_card_hidden.
-- The Hub list, tags, counts, the public page and the sitemap all read recipe_cards under row
-- level security (hub_cards and hub_popular_tags are security invoker; the share-page worker uses
-- the publishable key), so the policy below hides the card from all of them at once.

alter table public.recipe_cards
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text
    check (hidden_reason is null or char_length(hidden_reason) <= 200);

comment on column public.recipe_cards.hidden_at is
  'When the card was taken off the public Hub (moderation or an admin). Null: public.';
comment on column public.recipe_cards.hidden_reason is
  'Why: "moderation:<reason>" from extract-recipe, or what the admin wrote.';

create index if not exists recipe_cards_hidden_idx
  on public.recipe_cards (hidden_at desc)
  where hidden_at is not null;

drop policy if exists "Anyone can read cooking hub cards" on public.recipe_cards;
create policy "Anyone can read cooking hub cards"
  on public.recipe_cards for select
  using (hidden_at is null);

-- Admin functions -------------------------------------------------------------------
-- Callable by an admin from the app, by Edge Functions (service role), and from the SQL editor.

create or replace function public.can_moderate_recipe_cards()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_current_user_admin()
    or coalesce(auth.role(), '') = 'service_role'
    -- The dashboard's SQL editor: not the API's login, and no API token on the request.
    or (
      session_user <> 'authenticator'
      and nullif(current_setting('request.jwt.claims', true), '') is null
    );
$$;

-- p_card: the card's id, its slug, or its page address (https://pinch-app.io/r/<slug> or
-- /hub/<id>). p_hidden false puts the card back. Returns the card's id.
create or replace function public.admin_set_recipe_card_hidden(
  p_card text,
  p_hidden boolean default true,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := trim(coalesce(p_card, ''));
  v_id uuid;
begin
  if not public.can_moderate_recipe_cards() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  v_ref := regexp_replace(v_ref, '^https?://[^/]+/(r|hub)/', '');
  v_ref := trim(both '/' from split_part(split_part(v_ref, '?', 1), '#', 1));
  if v_ref = '' then
    raise exception 'card_required' using errcode = '22023';
  end if;

  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.recipe_cards where id = v_ref::uuid;
  else
    select id into v_id from public.recipe_cards where public_slug = v_ref;
  end if;
  if v_id is null then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;

  update public.recipe_cards
  set hidden_at = case when coalesce(p_hidden, true) then coalesce(hidden_at, now()) else null end,
      hidden_reason = case
        when coalesce(p_hidden, true) then left(coalesce(nullif(trim(p_reason), ''), hidden_reason, 'admin'), 200)
        else null
      end,
      -- The sitemap and IndexNow ping go by updated_at, so search engines hear about the change.
      updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

-- Hidden cards, newest first, for review.
create or replace function public.admin_hidden_recipe_cards(p_limit int default 100)
returns table (
  id uuid,
  public_slug text,
  title text,
  original_url text,
  platform text,
  hidden_at timestamptz,
  hidden_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_moderate_recipe_cards() then
    raise exception 'admin_only' using errcode = '42501';
  end if;

  return query
  select c.id, c.public_slug, c.title, c.original_url, c.platform, c.hidden_at, c.hidden_reason
  from public.recipe_cards c
  where c.hidden_at is not null
  order by c.hidden_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.can_moderate_recipe_cards() from public, anon, authenticated;
revoke all on function public.admin_set_recipe_card_hidden(text, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_hidden_recipe_cards(int) from public, anon, authenticated;
grant execute on function public.can_moderate_recipe_cards() to service_role;
grant execute on function public.admin_set_recipe_card_hidden(text, boolean, text) to authenticated, service_role;
grant execute on function public.admin_hidden_recipe_cards(int) to authenticated, service_role;
