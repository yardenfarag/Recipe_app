-- User-named recipe collections (many-to-many cookbooks).

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint collections_name_nonempty check (char_length(trim(name)) > 0)
);

create unique index collections_user_name_unique
  on public.collections (user_id, lower(trim(name)));

create index collections_user_id_idx on public.collections (user_id);

alter table public.collections enable row level security;

create policy "Users read own collections"
  on public.collections for select
  using (auth.uid() = user_id);

create policy "Users insert own collections"
  on public.collections for insert
  with check (auth.uid() = user_id);

create policy "Users update own collections"
  on public.collections for update
  using (auth.uid() = user_id);

create policy "Users delete own collections"
  on public.collections for delete
  using (auth.uid() = user_id);

create table public.collection_recipes (
  collection_id uuid not null references public.collections(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);

create index collection_recipes_recipe_id_idx
  on public.collection_recipes (recipe_id);

alter table public.collection_recipes enable row level security;

create policy "Users read own collection recipes"
  on public.collection_recipes for select
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

create policy "Users insert own collection recipes"
  on public.collection_recipes for insert
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = auth.uid()
    )
  );

create policy "Users delete own collection recipes"
  on public.collection_recipes for delete
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

comment on table public.collections is
  'User-named cookbooks; recipes may belong to many collections.';
