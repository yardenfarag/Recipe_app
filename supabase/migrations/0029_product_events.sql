-- Who did what in the app. Clients insert their own rows; only admins can read them.

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guest_install_id text,
  name text not null check (
    name in (
      'recipe_extracted',
      'recipe_saved',
      'paywall_viewed',
      'onboarding_completed'
    )
  ),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_events_actor_check check (
    user_id is not null or guest_install_id is not null
  )
);

comment on table public.product_events is
  'Product events for understanding how people use Pinch. Not a cost ledger.';

create index product_events_created_at_idx
  on public.product_events (created_at desc);

create index product_events_user_id_created_at_idx
  on public.product_events (user_id, created_at desc);

create index product_events_name_created_at_idx
  on public.product_events (name, created_at desc);

alter table public.product_events enable row level security;

create policy "Signed-in users insert their own product events"
  on public.product_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Guests insert anonymous product events"
  on public.product_events
  for insert
  to anon
  with check (user_id is null and guest_install_id is not null);

create policy "Admins read product events"
  on public.product_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

grant insert on public.product_events to anon, authenticated;
grant select on public.product_events to authenticated;
