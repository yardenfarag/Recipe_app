-- Opaque recipe share links: snapshot + token (not live recipe rows).
-- Edge functions use the service role; no client RLS policies on purpose.

create table public.recipe_shares (
  token text primary key,
  created_by uuid not null references public.profiles(id) on delete cascade,
  source_recipe_id uuid references public.recipes(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  claim_count int not null default 0
);

create index recipe_shares_source_recipe_id_idx
  on public.recipe_shares (source_recipe_id)
  where revoked_at is null;

create index recipe_shares_created_by_idx
  on public.recipe_shares (created_by);

alter table public.recipe_shares enable row level security;

create table public.recipe_share_claims (
  token text not null references public.recipe_shares(token) on delete cascade,
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (token, claimed_by)
);

create index recipe_share_claims_claimed_by_idx
  on public.recipe_share_claims (claimed_by);

alter table public.recipe_share_claims enable row level security;

comment on table public.recipe_shares is
  'Public share tokens with immutable recipe snapshots. Accessed only via recipe-share edge function.';

comment on table public.recipe_share_claims is
  'Idempotent per-user claims of a share token into recipes.';
