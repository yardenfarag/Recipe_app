-- Shopping list items (one shared list per user).

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  checked boolean not null default false,
  -- text[] so guest recipe ids can migrate without uuid casting failures
  source_recipe_ids text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_list_items_user_checked_idx
  on public.shopping_list_items (user_id, checked);

alter table public.shopping_list_items enable row level security;

create policy "Users read own shopping list"
  on public.shopping_list_items for select
  using (auth.uid() = user_id);

create policy "Users insert own shopping list"
  on public.shopping_list_items for insert
  with check (auth.uid() = user_id);

create policy "Users update own shopping list"
  on public.shopping_list_items for update
  using (auth.uid() = user_id);

create policy "Users delete own shopping list"
  on public.shopping_list_items for delete
  using (auth.uid() = user_id);

comment on table public.shopping_list_items is
  'Per-user grocery list lines; quantities merge client-side by name+unit.';
