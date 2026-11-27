-- PIN-77: every recipe in every app language, made in the background when it is extracted, so a cook sees their
-- own language straight away (the Library, the Hub, the meal plan, the shopping list) instead of translating on open.
--   * recipe_card_translations: a Hub card in each app language, shared by every cook who reads or saves it.
--   * The cook's own copy keeps using recipe_translations (ADR 012); the server fills it too.
--
-- Expand only: new tables, functions and triggers. Old builds don't read any of it.

create table if not exists public.recipe_card_translations (
  card_id uuid not null references public.recipe_cards(id) on delete cascade,
  language_code text not null check (language_code in ('en', 'he', 'ar', 'ru', 'es')),
  title text not null check (char_length(btrim(title)) > 0),
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  translation_version integer not null check (translation_version between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (card_id, language_code)
);

comment on table public.recipe_card_translations is
  'PIN-77: a Hub card in an app language, made by the server (extract-recipe, backfill-translations). Read like the card.';

alter table public.recipe_card_translations enable row level security;
revoke all on public.recipe_card_translations from anon, authenticated;
grant select on public.recipe_card_translations to anon, authenticated;

drop policy if exists "Anyone reads translations of visible Hub cards" on public.recipe_card_translations;
create policy "Anyone reads translations of visible Hub cards"
  on public.recipe_card_translations for select
  to anon, authenticated
  using (exists (select 1 from public.recipe_cards c where c.id = card_id and c.hidden_at is null));

-- ── What makes two copies "the same recipe" for a translation ──────────────
-- A translation is of the whole text, so the key covers the title, each named ingredient (its name, amount and unit:
-- a translation carries the amounts of the text it was made from) and each step's text, lower case, trimmed, in
-- order. Null when there is nothing to match on (no title, or no named ingredient and no step), so such a recipe
-- never takes anyone's translation.
create or replace function public.recipe_content_key(p_title text, p_ingredients jsonb, p_instructions jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with ingredient_lines as (
    select
      lower(btrim(item.value ->> 'name', E' \t\r\n')) || E'\x1f'
        || coalesce(item.value ->> 'quantity', '') || E'\x1f'
        || lower(btrim(coalesce(item.value ->> 'unit', ''), E' \t\r\n')) as line,
      item.ordinality as position
    from jsonb_array_elements(case when jsonb_typeof(p_ingredients) = 'array' then p_ingredients else '[]'::jsonb end)
      with ordinality as item(value, ordinality)
    where jsonb_typeof(item.value) = 'object'
      and btrim(coalesce(item.value ->> 'name', ''), E' \t\r\n') <> ''
  ),
  step_lines as (
    select lower(btrim(item.value ->> 'text', E' \t\r\n')) as line, item.ordinality as position
    from jsonb_array_elements(case when jsonb_typeof(p_instructions) = 'array' then p_instructions else '[]'::jsonb end)
      with ordinality as item(value, ordinality)
    where jsonb_typeof(item.value) = 'object'
      and btrim(coalesce(item.value ->> 'text', ''), E' \t\r\n') <> ''
  )
  select case
    when btrim(coalesce(p_title, ''), E' \t\r\n') = '' then null
    when not exists (select 1 from ingredient_lines) and not exists (select 1 from step_lines) then null
    else md5(
      lower(btrim(p_title, E' \t\r\n')) || E'\x1e'
      || coalesce((select string_agg(line, E'\n' order by position) from ingredient_lines), '') || E'\x1e'
      || coalesce((select string_agg(line, E'\n' order by position) from step_lines), '')
    )
  end;
$$;

-- Only the security definer functions below call it (as the owner), and the server.
revoke all on function public.recipe_content_key(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.recipe_content_key(text, jsonb, jsonb) to service_role;

-- ── A card's translations go stale with its text ───────────────────────────
-- A partial card replaced by a full extraction (publishRecipeCard), or an admin edit: the old translations are of
-- another text, so they go, and the next extraction or the backfill makes new ones.
create or replace function public.recipe_cards_clear_stale_translations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.recipe_content_key(new.title, new.ingredients, new.instructions)
     is distinct from public.recipe_content_key(old.title, old.ingredients, old.instructions) then
    delete from public.recipe_card_translations where card_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.recipe_cards_clear_stale_translations() from public, anon, authenticated;

drop trigger if exists recipe_cards_clear_stale_translations on public.recipe_cards;
create trigger recipe_cards_clear_stale_translations
  after update of title, ingredients, instructions on public.recipe_cards
  for each row execute function public.recipe_cards_clear_stale_translations();

-- ── Translated when saved ───────────────────────────────────────────────────
-- An extraction translates the recipe in the background, after it has answered the app (the Hub card's translations,
-- or ones of its own when there is no card or the card's text differs). The app saves the cook's copy separately, so
-- the two meet here, in either order, like the diets (20261127135000_recipe_diets.sql):
--   * the translations wait in recipe_translations_pending, by cook, text and language, and the save picks them up;
--   * if the recipe was saved first, remember_recipe_translations copies them into it straight away.
-- A recipe saved from the Hub (claim_recipe_card), or extracted from a page whose card has the same text, takes the
-- card's translations for any language still missing. A translation the recipe already has is never replaced (the
-- app may have made it).

create table if not exists public.recipe_translations_pending (
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_key text not null,
  language_code text not null check (language_code in ('en', 'he', 'ar', 'ru', 'es')),
  title text not null check (char_length(btrim(title)) > 0),
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  translation_version integer not null check (translation_version between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, content_key, language_code)
);

comment on table public.recipe_translations_pending is
  'PIN-77: translations an extraction made, waiting for the cook to save the recipe (picked up by the recipes insert trigger). Kept a day.';

alter table public.recipe_translations_pending enable row level security;
-- No policies: only the functions below and extract-recipe (service role) touch it.
revoke all on public.recipe_translations_pending from anon, authenticated;

-- The card's translations into the given recipes, for languages they don't have yet, when the card (found by the
-- recipe's link, the way claim_recipe_card saves it) has the same text. Returns what it copied. Used by the insert
-- trigger and by backfill-translations (target "recipes"), so a Library recipe from a translated card costs nothing.
create or replace function public.copy_card_translations_to_recipes(p_recipe_ids uuid[])
returns table (recipe_id uuid, language_code text)
language sql
security definer
set search_path = public
as $$
  insert into public.recipe_translations as t
    (recipe_id, language_code, title, ingredients, instructions, translation_version)
  select r.id, ct.language_code, ct.title, ct.ingredients, ct.instructions, ct.translation_version
  from public.recipes r
  join public.recipe_cards c
    on c.canonical_key = public.recipe_card_canonical_key(r.platform, r.original_url)
  join public.recipe_card_translations ct on ct.card_id = c.id
  where r.id = any(p_recipe_ids)
    and r.original_url is not null
    and public.recipe_content_key(c.title, c.ingredients, c.instructions)
        = public.recipe_content_key(r.title, r.ingredients, r.instructions)
  on conflict (recipe_id, language_code) do nothing
  returning t.recipe_id, t.language_code;
$$;

revoke all on function public.copy_card_translations_to_recipes(uuid[]) from public, anon, authenticated;
grant execute on function public.copy_card_translations_to_recipes(uuid[]) to service_role;

create or replace function public.recipes_fill_translations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  v_key := public.recipe_content_key(new.title, new.ingredients, new.instructions);
  if v_key is null then
    return null;
  end if;

  insert into public.recipe_translations (recipe_id, language_code, title, ingredients, instructions, translation_version)
  select new.id, p.language_code, p.title, p.ingredients, p.instructions, p.translation_version
  from public.recipe_translations_pending p
  where p.user_id = new.user_id and p.content_key = v_key and p.created_at > now() - interval '1 day'
  on conflict (recipe_id, language_code) do nothing;

  if new.original_url is not null then
    perform public.copy_card_translations_to_recipes(array[new.id]);
  end if;
  return null;
end;
$$;

revoke all on function public.recipes_fill_translations() from public, anon, authenticated;

drop trigger if exists recipes_fill_translations on public.recipes;
create trigger recipes_fill_translations
  after insert on public.recipes
  for each row execute function public.recipes_fill_translations();

-- extract-recipe (service role) after its translations: keep them for the save, and fill a copy saved already.
-- p_translations: { "<language>": { title, ingredients, instructions, translation_version }, ... }; entries that
-- aren't an app language or a complete translation are left out. Returns the translations copied into saved copies.
create or replace function public.remember_recipe_translations(
  p_user_id uuid,
  p_title text,
  p_ingredients jsonb,
  p_instructions jsonb,
  p_translations jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := public.recipe_content_key(p_title, p_ingredients, p_instructions);
  copied integer;
begin
  if p_user_id is null or v_key is null or jsonb_typeof(p_translations) is distinct from 'object' then
    return 0;
  end if;
  delete from public.recipe_translations_pending where user_id = p_user_id and created_at <= now() - interval '1 day';

  insert into public.recipe_translations_pending
    (user_id, content_key, language_code, title, ingredients, instructions, translation_version)
  select p_user_id, v_key, e.key, btrim(e.value ->> 'title'), e.value -> 'ingredients', e.value -> 'instructions',
         (e.value ->> 'translation_version')::integer
  from jsonb_each(p_translations) e
  where e.key in ('en', 'he', 'ar', 'ru', 'es')
    and jsonb_typeof(e.value) = 'object'
    and btrim(coalesce(e.value ->> 'title', '')) <> ''
    and jsonb_typeof(e.value -> 'ingredients') = 'array'
    and jsonb_typeof(e.value -> 'instructions') = 'array'
    and coalesce(e.value ->> 'translation_version', '') ~ '^[0-9]{1,4}$'
    and (e.value ->> 'translation_version')::integer between 1 and 1000
  on conflict (user_id, content_key, language_code) do update
    set title = excluded.title,
        ingredients = excluded.ingredients,
        instructions = excluded.instructions,
        translation_version = excluded.translation_version,
        created_at = now();

  insert into public.recipe_translations (recipe_id, language_code, title, ingredients, instructions, translation_version)
  select r.id, p.language_code, p.title, p.ingredients, p.instructions, p.translation_version
  from public.recipes r
  join public.recipe_translations_pending p on p.user_id = r.user_id and p.content_key = v_key
  where r.user_id = p_user_id
    and r.created_at > now() - interval '1 day'
    and public.recipe_content_key(r.title, r.ingredients, r.instructions) = v_key
  on conflict (recipe_id, language_code) do nothing;
  get diagnostics copied = row_count;
  return copied;
end;
$$;

revoke all on function public.remember_recipe_translations(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.remember_recipe_translations(uuid, text, jsonb, jsonb, jsonb) to service_role;

-- remember_recipe_translations reads the cook's copies saved in the last day.
create index if not exists recipes_user_created_idx on public.recipes (user_id, created_at);
