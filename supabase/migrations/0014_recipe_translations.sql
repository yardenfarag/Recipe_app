-- Recipe language: keep canonical content on recipes.*; cache per-language overlays.

alter table public.recipes
  add column if not exists source_language text;

comment on column public.recipes.source_language is
  'BCP-47 language code of canonical title/ingredients/instructions (usually en from extract).';

create table if not exists public.recipe_translations (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  language_code text not null,
  title text not null,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (recipe_id, language_code),
  constraint recipe_translations_language_nonempty check (char_length(trim(language_code)) > 0),
  constraint recipe_translations_title_nonempty check (char_length(trim(title)) > 0)
);

create index if not exists recipe_translations_language_idx
  on public.recipe_translations (language_code);

alter table public.recipe_translations enable row level security;

create policy "Users read own recipe translations"
  on public.recipe_translations for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );

create policy "Users insert own recipe translations"
  on public.recipe_translations for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );

create policy "Users update own recipe translations"
  on public.recipe_translations for update
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );

create policy "Users delete own recipe translations"
  on public.recipe_translations for delete
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );
