-- Free + Pinch Plus extract quotas (replaces product-token metering for extracts).
-- Honor-system self-serve upgrade/cancel until real IAP. Support tickets inbox.

-- ============================================================
-- 1. profiles subscription + free extract counters
-- ============================================================

alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_expires_at timestamptz null,
  add column if not exists free_extracts_used int not null default 0;

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('free', 'active', 'canceled'));

alter table public.profiles
  drop constraint if exists profiles_free_extracts_used_check;

alter table public.profiles
  add constraint profiles_free_extracts_used_check
  check (free_extracts_used >= 0);

comment on column public.profiles.subscription_status is
  'free | active (Pinch Plus) | canceled. Honor-system until IAP.';
comment on column public.profiles.subscription_expires_at is
  'Optional expiry; null + active = indefinite (manual / honor grants).';
comment on column public.profiles.free_extracts_used is
  'Lifetime free extract count for non-Plus users (limit 10).';

-- ============================================================
-- 2. extract_usage_monthly (Plus calendar-month quota)
-- ============================================================

create table if not exists public.extract_usage_monthly (
  user_id uuid not null references public.profiles(id) on delete cascade,
  year_month text not null,
  extract_count int not null default 0 check (extract_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, year_month),
  constraint extract_usage_monthly_year_month_check
    check (year_month ~ '^\d{4}-\d{2}$')
);

comment on table public.extract_usage_monthly is
  'Per-user extract counts keyed by UTC YYYY-MM for Pinch Plus monthly caps.';

alter table public.extract_usage_monthly enable row level security;

create policy "Users read own monthly extract usage"
  on public.extract_usage_monthly for select
  using (auth.uid() = user_id);

create policy "Admins read all monthly extract usage"
  on public.extract_usage_monthly for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ============================================================
-- 3. support_tickets
-- ============================================================

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  category text not null default 'other'
    check (category in ('billing', 'bug', 'account', 'other')),
  message text not null,
  status text not null default 'open'
    check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);
create index if not exists support_tickets_status_created_at_idx
  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_id_created_at_idx
  on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;

create policy "Users insert own support tickets"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

create policy "Users read own support tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

create policy "Admins read all support tickets"
  on public.support_tickets for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy "Admins update support tickets"
  on public.support_tickets for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ============================================================
-- 4. Quota / subscription RPCs
-- ============================================================

create or replace function public.is_subscription_active(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st text;
  expires timestamptz;
begin
  select subscription_status, subscription_expires_at
  into st, expires
  from public.profiles
  where id = p_user_id;

  if st is null then
    return false;
  end if;

  if st <> 'active' then
    return false;
  end if;

  if expires is not null and expires <= now() then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.reserve_free_extract(
  p_user_id uuid,
  p_limit int default 10
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_limit';
  end if;

  update public.profiles
  set free_extracts_used = free_extracts_used + 1
  where id = p_user_id
    and free_extracts_used < p_limit
  returning free_extracts_used into new_count;

  if new_count is null then
    -- Distinguish missing profile vs over limit.
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'profile_not_found';
    end if;
    return -1;
  end if;

  return new_count;
end;
$$;

create or replace function public.reserve_monthly_extract(
  p_user_id uuid,
  p_year_month text,
  p_limit int default 90
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if p_year_month is null or p_year_month !~ '^\d{4}-\d{2}$' then
    raise exception 'invalid_year_month';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_limit';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.extract_usage_monthly (user_id, year_month, extract_count, updated_at)
  values (p_user_id, p_year_month, 1, now())
  on conflict (user_id, year_month) do update
    set extract_count = public.extract_usage_monthly.extract_count + 1,
        updated_at = now()
    where public.extract_usage_monthly.extract_count < p_limit
  returning extract_count into new_count;

  if new_count is null then
    return -1;
  end if;

  return new_count;
end;
$$;

-- Self-serve honor-system Plus (until IAP). Caller must be the user (or service_role).
create or replace function public.activate_subscription(p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_user_id, auth.uid());
  new_status text;
begin
  if target is null then
    raise exception 'not_authenticated';
  end if;
  if auth.uid() is not null and auth.uid() <> target then
    -- Admins may activate for another user.
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  update public.profiles
  set subscription_status = 'active',
      subscription_expires_at = null
  where id = target
  returning subscription_status into new_status;

  if new_status is null then
    raise exception 'profile_not_found';
  end if;

  return new_status;
end;
$$;

create or replace function public.cancel_subscription(p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(p_user_id, auth.uid());
  new_status text;
begin
  if target is null then
    raise exception 'not_authenticated';
  end if;
  if auth.uid() is not null and auth.uid() <> target then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  update public.profiles
  set subscription_status = 'canceled'
  where id = target
    and subscription_status = 'active'
  returning subscription_status into new_status;

  if new_status is null then
    -- Already canceled/free or missing profile.
    select subscription_status into new_status
    from public.profiles
    where id = target;
    if new_status is null then
      raise exception 'profile_not_found';
    end if;
    if new_status <> 'canceled' then
      update public.profiles
      set subscription_status = 'canceled'
      where id = target
      returning subscription_status into new_status;
    end if;
  end if;

  return new_status;
end;
$$;

revoke all on function public.is_subscription_active(uuid) from public;
revoke all on function public.reserve_free_extract(uuid, int) from public;
revoke all on function public.reserve_monthly_extract(uuid, text, int) from public;
revoke all on function public.activate_subscription(uuid) from public;
revoke all on function public.cancel_subscription(uuid) from public;

grant execute on function public.is_subscription_active(uuid) to service_role;
grant execute on function public.reserve_free_extract(uuid, int) to service_role;
grant execute on function public.reserve_monthly_extract(uuid, text, int) to service_role;

-- Authenticated users may self-activate / self-cancel (honor system).
grant execute on function public.activate_subscription(uuid) to authenticated, service_role;
grant execute on function public.cancel_subscription(uuid) to authenticated, service_role;

-- ============================================================
-- 5. Signup: no token bonus; free subscription defaults
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    token_balance,
    subscription_status,
    free_extracts_used
  )
  values (
    new.id,
    new.email,
    0,
    'free',
    0
  );

  return new;
end;
$$;
