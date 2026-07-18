-- User-marked recipes for quick access from the library home screen.

alter table public.recipes
  add column is_favorite boolean not null default false;

create index recipes_user_favorites_idx on public.recipes (user_id, is_favorite)
  where is_favorite = true;

comment on column public.recipes.is_favorite is
  'When true, surfaced in the library Favorites section for quick access.';
