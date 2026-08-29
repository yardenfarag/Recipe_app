-- Cooked stamp + persist kitchen auto-apply so the whisper survives save.

alter table public.recipes
  add column if not exists last_cooked_at timestamptz;

alter table public.recipes
  add column if not exists cook_note text;

alter table public.recipes
  drop constraint if exists recipes_cook_note_len;
alter table public.recipes
  add constraint recipes_cook_note_len
  check (cook_note is null or char_length(cook_note) <= 160);

alter table public.recipes
  add column if not exists kitchen_adapted_summary text;

alter table public.recipes
  add column if not exists kitchen_original jsonb;

comment on column public.recipes.last_cooked_at is
  'Most recent time the user marked this recipe as cooked. Not a streak.';
comment on column public.recipes.cook_note is
  'Optional one-line note from the last cook, shown next time they open the recipe.';
comment on column public.recipes.kitchen_adapted_summary is
  'Short summary when kitchen auto-apply adapted this extract. Null if not adapted.';
comment on column public.recipes.kitchen_original is
  'Canonical content before kitchen auto-apply, used to revert.';

comment on column public.profiles.kitchen is
  'User kitchen preferences: diets, defaultServings, alwaysSwap, autoApplyOnExtract, pantryStaples.';
