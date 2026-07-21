-- Browseable / trendable labels from Gemini extraction.

alter table public.recipes
  add column tags text[] not null default '{}';

create index recipes_tags_gin_idx on public.recipes using gin (tags);

comment on column public.recipes.tags is
  'Short lowercase recipe labels (cuisine, meal, dish type, method, traits) for browsing and trends.';
