-- Households (ADR 034): the people who live together share one shopping list, one pantry and one "Always have"
-- list. Recipes, credits, appliances and pantry scans in progress stay with each person.
--
--   * Everyone always has a household. Each existing profile gets one here, and a trigger makes one for every new
--     profile. Until it is set up (named) it is a household of one, and the apps show nothing of it.
--   * Every member is equal: anyone can rename it, change its picture, invite, remove someone or leave. Up to 8.
--   * shopping_list_items and pantry_items get a household_id, and RLS moves from "my rows" to "my household's
--     rows". user_id stays as who added the row ("Added by"; for the pantry, who last added or scanned it).
--   * Clients never write households, members or invites directly: the RPCs below do, as security definer.
--   * Triggers stamp households.list_changed_at / pantry_changed_at / household_changed_at, and the apps watch
--     that one row over Realtime (shared/lib/supabase/household.ts → subscribeToHousehold).
--   * household_activity queues pushes: items added to the list (one per burst), people joining, leaving or
--     being removed. The household-activity function sends them; a cron job calls it when something is due.
--
-- Expand only for the shopping list, which is live with old app builds: they insert without household_id (a
-- trigger fills it), read the whole household's list under the new policies, and keep working.

-- ── Small helpers ──────────────────────────────────────────────────────────
-- A name or label as typed: spaces collapsed and trimmed, cut to p_max. Null when nothing is left.
create or replace function public.household_clean_text(p_text text, p_max int)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(left(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), p_max)), '');
$$;

-- The "Always have" list as stored: trimmed, at most 60 characters each, no duplicates (ignoring case, the first
-- one wins), at most 40.
create or replace function public.clean_household_staples(p_staples text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(s.name order by s.first_at), '{}'::text[])
  from (
    select (array_agg(c.name order by c.ord))[1] as name, min(c.ord) as first_at
    from (
      select public.household_clean_text(u.item, 60) as name, u.ord
      from unnest(coalesce(p_staples, '{}'::text[])) with ordinality as u(item, ord)
    ) c
    where c.name is not null
    group by lower(c.name)
    order by min(c.ord)
    limit 40
  ) s;
$$;

create or replace function public.household_staples_fit(p_staples text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_staples) <= 40
    and coalesce((select bool_and(char_length(x) between 1 and 60) from unnest(p_staples) as x), true);
$$;

revoke all on function public.household_clean_text(text, int) from public, anon, authenticated;
revoke all on function public.clean_household_staples(text[]) from public, anon, authenticated;
revoke all on function public.household_staples_fit(text[]) from public, anon, authenticated;

-- ── Tables ─────────────────────────────────────────────────────────────────
create table public.households (
  id uuid primary key default gen_random_uuid(),
  -- Null until set up.
  name text check (name is null or char_length(name) between 1 and 40),
  -- `house:<id>` from the apps' householdAvatars.
  avatar text check (avatar is null or avatar ~ '^house:[a-z]+$'),
  set_up_at timestamptz,
  -- "Always have": staples that stay off the shopping list unless added by hand.
  staples text[] not null default '{}' check (public.household_staples_fit(staples)),
  created_at timestamptz not null default now(),
  -- Change stamps for Realtime (see the triggers below).
  list_changed_at timestamptz not null default now(),
  pantry_changed_at timestamptz not null default now(),
  household_changed_at timestamptz not null default now(),
  check (set_up_at is null or (name is not null and avatar is not null))
);

comment on table public.households is
  'ADR 034: people who share a shopping list, pantry and "Always have". Everyone has one; a household of one until set up. Written only through the household RPCs.';

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  -- One household per person.
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  -- The name the others see. '' until the household is set up or joined.
  display_name text not null default '' check (char_length(display_name) <= 30),
  joined_at timestamptz not null default now(),
  -- "I'm going shopping", at most once in 20 hours.
  going_shopping_sent_at timestamptz,
  primary key (household_id, user_id)
);

comment on table public.household_members is
  'ADR 034: who lives in which household, and the name they use there. Written only through the household RPCs.';

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 32 random bytes, base64url. Kept so the members can share the same link again; only the RPCs read it.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz
);

-- One link at a time: making a new one stops the old.
create unique index household_invites_one_open_idx
  on public.household_invites (household_id)
  where stopped_at is null;

comment on table public.household_invites is
  'ADR 034: invite links, one live per household, 7 days. Read and written only by the household RPCs.';

create table public.household_activity (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('list_added', 'member_joined', 'member_left', 'member_removed')),
  -- Who did it. Null once their account is gone.
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  -- member_removed: who was removed.
  subject_id uuid references public.profiles (id) on delete set null,
  subject_name text not null default '',
  -- list_added: items added in this burst.
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  -- list_added: the last add in this burst; the push goes out once the actor has been quiet for 2 minutes.
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

-- One open burst per person and household.
create unique index household_activity_open_burst_idx
  on public.household_activity (household_id, actor_id)
  where kind = 'list_added' and sent_at is null;
create index household_activity_unsent_idx on public.household_activity (created_at) where sent_at is null;

comment on table public.household_activity is
  'ADR 034: pushes waiting to go to the other members (household-activity function). Service role only.';

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_activity enable row level security;

revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
revoke all on public.household_invites from anon, authenticated;
revoke all on public.household_activity from anon, authenticated;

-- ── Whose household am I in ────────────────────────────────────────────────
-- Volatile, not stable: an insert's WITH CHECK must see a household that household_fill_row made for the same row
-- (a stable function reads the statement's starting snapshot). Policies call it as an initplan, `(select …)`, so it
-- still runs once per query and the household_id indexes are still used.
create or replace function public.my_household_id()
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = (select auth.uid());
$$;

revoke all on function public.my_household_id() from public, anon, authenticated;
-- Policies and the household_id column defaults call it as the caller. anon and the service role get null (no
-- rows; the service role's inserts get their household from household_fill_row).
grant execute on function public.my_household_id() to anon, authenticated, service_role;

-- Members read their own household row: Realtime needs it to send them its updates.
grant select on public.households to authenticated;
create policy "Members read their household"
  on public.households for select
  to authenticated
  using (id = (select public.my_household_id()));

alter publication supabase_realtime add table public.households;

-- ── Everyone has a household ───────────────────────────────────────────────
-- My household, made if I have none (a profile older than this migration that the backfill missed).
create or replace function public.household_ensure(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select m.household_id into v_household from public.household_members m where m.user_id = p_user;
  if v_household is not null then
    return v_household;
  end if;
  insert into public.households default values returning id into v_household;
  insert into public.household_members (household_id, user_id) values (v_household, p_user)
  on conflict (user_id) do nothing;
  if not found then
    -- Made in parallel: keep the other one.
    delete from public.households where id = v_household;
    select m.household_id into v_household from public.household_members m where m.user_id = p_user;
  end if;
  return v_household;
end;
$$;

revoke all on function public.household_ensure(uuid) from public, anon, authenticated;

-- New profiles get one from now on. The trigger comes before the backfill, so a sign-up during this migration is
-- covered by one or the other (household_fill_row covers anything that still slips through).
create or replace function public.household_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.household_ensure(new.id);
  return null;
end;
$$;

revoke all on function public.household_for_new_profile() from public, anon, authenticated;

create trigger household_for_new_profile
  after insert on public.profiles
  for each row execute function public.household_for_new_profile();

-- Backfill: one household per existing profile, with the "Always have" list from profiles.kitchen.
create temporary table household_backfill as
select
  p.id as user_id,
  gen_random_uuid() as household_id,
  public.clean_household_staples(array(
    select e.value #>> '{}'
    from jsonb_array_elements(
      case when jsonb_typeof(p.kitchen -> 'pantryStaples') = 'array' then p.kitchen -> 'pantryStaples' else '[]'::jsonb end
    ) with ordinality as e(value, ord)
    where jsonb_typeof(e.value) = 'string'
    order by e.ord
  )) as staples
from public.profiles p
where not exists (select 1 from public.household_members m where m.user_id = p.id);

insert into public.households (id, staples) select household_id, staples from household_backfill;
-- Someone the trigger reached first keeps that household; the spare one is dropped.
insert into public.household_members (household_id, user_id)
select household_id, user_id from household_backfill
on conflict (user_id) do nothing;
delete from public.households h
where h.id in (select b.household_id from household_backfill b)
  and not exists (select 1 from public.household_members m where m.household_id = h.id);

drop table household_backfill;

-- Deleting an account removes its member row, whose trigger then updates the household. Locking the household
-- first keeps the order the RPCs use (household, then members), so a deletion and a leave can't deadlock.
create or replace function public.household_lock_before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.households h
  where h.id = (select m.household_id from public.household_members m where m.user_id = old.id)
  for update;
  return old;
end;
$$;

revoke all on function public.household_lock_before_profile_delete() from public, anon, authenticated;

create trigger household_lock_before_profile_delete
  before delete on public.profiles
  for each row execute function public.household_lock_before_profile_delete();

-- ── Shared rows: household_id on the list and the pantry ───────────────────
-- Fills household_id (and user_id) when nobody sent them: the service role, and for clients the column default
-- (my_household_id()) normally has. A profile without a household yet (made while this migration ran) gets one
-- here, so an old app build's insert never fails. RLS then checks the result.
create or replace function public.household_fill_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_who uuid;
begin
  if new.user_id is null then
    new.user_id := (select auth.uid());
  end if;
  if new.household_id is null then
    v_who := coalesce((select auth.uid()), new.user_id);
    new.household_id := (select m.household_id from public.household_members m where m.user_id = v_who);
    if new.household_id is null and v_who is not null then
      new.household_id := public.household_ensure(v_who);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.household_fill_row() from public, anon, authenticated;

-- Shopping list (live, expand only).
alter table public.shopping_list_items
  add column household_id uuid references public.households (id) on delete cascade;

update public.shopping_list_items s
set household_id = m.household_id
from public.household_members m
where m.user_id = s.user_id and s.household_id is null;

-- user_id is who added the line. Deleting that account keeps the line on everyone else's list. The default makes
-- household_id optional for clients (and in the generated types). For the service role it is null, and
-- household_fill_row fills it from user_id.
alter table public.shopping_list_items
  alter column household_id set not null,
  alter column household_id set default public.my_household_id(),
  alter column user_id drop not null,
  drop constraint shopping_list_items_user_id_fkey,
  add constraint shopping_list_items_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

create index shopping_list_items_household_idx on public.shopping_list_items (household_id, checked);

comment on table public.shopping_list_items is
  'The household''s grocery list (ADR 034); user_id is who added the line. Quantities merge client-side by name+unit.';

create trigger shopping_list_items_fill_household
  before insert on public.shopping_list_items
  for each row execute function public.household_fill_row();

-- Who added a line never changes on an edit, and no member can clear it. Only deleting that account clears it (the
-- foreign key's set-null), whoever runs the delete: the person themselves or an admin, whose auth.uid() is set. So
-- the test is whether the account is gone, read with the definer's rights (a member can't see others' profiles).
create or replace function public.shopping_list_keep_added_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     and (new.user_id is not null or exists (select 1 from public.profiles p where p.id = old.user_id)) then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.shopping_list_keep_added_by() from public, anon, authenticated;

create trigger shopping_list_keep_added_by
  before update on public.shopping_list_items
  for each row execute function public.shopping_list_keep_added_by();

-- A write older than the row is dropped. App builds already in people's hands merge on the phone and save back every
-- line they fetched, so without this a tick another member made meanwhile would be undone. Such a write carries the
-- updated_at it fetched, from before the other member's change. Current apps don't send updated_at on an edit at all
-- (it stays as it was, so the check passes), so only those old builds are judged by a phone clock; for them a write
-- counts as stale only when it is more than 30 seconds older than the row. Every write that goes through is stamped
-- with the database's time, so a phone whose clock runs ahead can't make everyone else's edits look old. Returning
-- the old row (not null) keeps update().select().single() working.
create or replace function public.shopping_list_skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at - interval '30 seconds' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.shopping_list_skip_stale_update() from public, anon, authenticated;

create trigger shopping_list_skip_stale_update
  before update on public.shopping_list_items
  for each row execute function public.shopping_list_skip_stale_update();

drop policy if exists "Users read own shopping list" on public.shopping_list_items;
drop policy if exists "Users insert own shopping list" on public.shopping_list_items;
drop policy if exists "Users update own shopping list" on public.shopping_list_items;
drop policy if exists "Users delete own shopping list" on public.shopping_list_items;

create policy "Members read the household list"
  on public.shopping_list_items for select
  to authenticated
  using (household_id = (select public.my_household_id()));
create policy "Members add to the household list"
  on public.shopping_list_items for insert
  to authenticated
  with check (household_id = (select public.my_household_id()) and user_id = (select auth.uid()));
create policy "Members change the household list"
  on public.shopping_list_items for update
  to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy "Members remove from the household list"
  on public.shopping_list_items for delete
  to authenticated
  using (household_id = (select public.my_household_id()));

-- Guests keep their list on the device; they never had a use for this table.
revoke all on public.shopping_list_items from anon;

-- Pantry (new in this PR, not yet deployed).
alter table public.pantry_items
  add column household_id uuid references public.households (id) on delete cascade;

update public.pantry_items p
set household_id = m.household_id
from public.household_members m
where m.user_id = p.user_id and p.household_id is null;

-- user_id is who last added or scanned the item.
alter table public.pantry_items
  alter column household_id set not null,
  alter column household_id set default public.my_household_id(),
  alter column user_id drop not null,
  drop constraint pantry_items_user_id_fkey,
  add constraint pantry_items_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null,
  drop constraint pantry_items_user_id_place_name_key_key,
  add constraint pantry_items_household_place_name_key unique (household_id, place, name_key);

create index pantry_items_household_idx on public.pantry_items (household_id, place);

comment on table public.pantry_items is
  'PIN-181, ADR 034: food the household has at home, by place; user_id is who last added or scanned it.';

create trigger pantry_items_fill_household
  before insert on public.pantry_items
  for each row execute function public.household_fill_row();

-- An edit that changes user_id (an upsert of a scan, say) records the member who made it; a member can't clear it.
-- Only deleting that account clears it (the foreign key's set-null), whoever runs the delete, admin included; see
-- shopping_list_keep_added_by.
create or replace function public.pantry_items_last_touched_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    if new.user_id is null then
      if exists (select 1 from public.profiles p where p.id = old.user_id) then
        new.user_id := old.user_id;
      end if;
    elsif (select auth.uid()) is not null then
      new.user_id := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.pantry_items_last_touched_by() from public, anon, authenticated;

create trigger pantry_items_last_touched_by
  before update on public.pantry_items
  for each row execute function public.pantry_items_last_touched_by();

drop policy if exists "Users read own pantry" on public.pantry_items;
drop policy if exists "Users add to own pantry" on public.pantry_items;
drop policy if exists "Users change own pantry" on public.pantry_items;
drop policy if exists "Users remove from own pantry" on public.pantry_items;

create policy "Members read the household pantry"
  on public.pantry_items for select
  to authenticated
  using (household_id = (select public.my_household_id()));
create policy "Members add to the household pantry"
  on public.pantry_items for insert
  to authenticated
  with check (household_id = (select public.my_household_id()) and user_id = (select auth.uid()));
create policy "Members change the household pantry"
  on public.pantry_items for update
  to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy "Members remove from the household pantry"
  on public.pantry_items for delete
  to authenticated
  using (household_id = (select public.my_household_id()));

-- 600 items per household (was per person). Runs after pantry_items_fill_household (triggers fire by name). An
-- insert that will land on an existing row (an upsert of something already there) adds nothing, so it passes even
-- at 600. name_key is a generated column, not yet computed in a BEFORE trigger, hence the expression again.
create or replace function public.pantry_items_within_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.pantry_items p
    where p.household_id = new.household_id
      and p.place = new.place
      and p.name_key = lower(regexp_replace(btrim(coalesce(nullif(btrim(new.name_en), ''), new.name)), '\s+', ' ', 'g'))
  ) then
    return new;
  end if;
  if (select count(*) from public.pantry_items where household_id = new.household_id) >= 600 then
    raise exception 'pantry_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── Change stamps ──────────────────────────────────────────────────────────
-- One update of the households row per statement (and none when this transaction already stamped it), so a
-- batch of 30 list lines is one Realtime event.
create or replace function public.household_list_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.households h set list_changed_at = now()
    where h.id in (select n.household_id from new_rows n) and h.list_changed_at is distinct from now();

    -- Lines someone adds to a shared list become one push to the others per burst.
    insert into public.household_activity as a (household_id, kind, actor_id, actor_name, item_count)
    select n.household_id, 'list_added', n.user_id, max(m.display_name), count(*)::int
    from new_rows n
    join public.household_members m on m.user_id = n.user_id and m.household_id = n.household_id
    where not n.checked
      and exists (
        select 1 from public.household_members o where o.household_id = n.household_id and o.user_id <> n.user_id
      )
    group by n.household_id, n.user_id
    on conflict (household_id, actor_id) where kind = 'list_added' and sent_at is null
    do update set item_count = a.item_count + excluded.item_count,
                  actor_name = excluded.actor_name,
                  updated_at = now();
  elsif tg_op = 'UPDATE' then
    update public.households h set list_changed_at = now()
    where h.id in (select n.household_id from new_rows n union select o.household_id from old_rows o)
      and h.list_changed_at is distinct from now();
  else
    update public.households h set list_changed_at = now()
    where h.id in (select o.household_id from old_rows o) and h.list_changed_at is distinct from now();
  end if;
  return null;
end;
$$;

create or replace function public.household_pantry_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.households h set pantry_changed_at = now()
    where h.id in (select n.household_id from new_rows n) and h.pantry_changed_at is distinct from now();
  elsif tg_op = 'UPDATE' then
    update public.households h set pantry_changed_at = now()
    where h.id in (select n.household_id from new_rows n union select o.household_id from old_rows o)
      and h.pantry_changed_at is distinct from now();
  else
    update public.households h set pantry_changed_at = now()
    where h.id in (select o.household_id from old_rows o) and h.pantry_changed_at is distinct from now();
  end if;
  return null;
end;
$$;

revoke all on function public.household_list_changed() from public, anon, authenticated;
revoke all on function public.household_pantry_changed() from public, anon, authenticated;

-- A trigger with transition tables takes one event, hence three each.
create trigger household_list_inserted
  after insert on public.shopping_list_items
  referencing new table as new_rows
  for each statement execute function public.household_list_changed();
create trigger household_list_updated
  after update on public.shopping_list_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.household_list_changed();
create trigger household_list_deleted
  after delete on public.shopping_list_items
  referencing old table as old_rows
  for each statement execute function public.household_list_changed();

create trigger household_pantry_inserted
  after insert on public.pantry_items
  referencing new table as new_rows
  for each statement execute function public.household_pantry_changed();
create trigger household_pantry_updated
  after update on public.pantry_items
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.household_pantry_changed();
create trigger household_pantry_deleted
  after delete on public.pantry_items
  referencing old table as old_rows
  for each statement execute function public.household_pantry_changed();

-- Name, picture, set-up and "Always have" stamp household_changed_at.
create or replace function public.household_stamp_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.name, new.avatar, new.set_up_at, new.staples) is distinct from (old.name, old.avatar, old.set_up_at, old.staples) then
    new.household_changed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.household_stamp_change() from public, anon, authenticated;

create trigger household_stamp_change
  before update on public.households
  for each row execute function public.household_stamp_change();

-- People arriving, leaving or renaming themselves stamp household_changed_at. A household nobody is left in is
-- deleted, with its list, pantry, invites and queued pushes. A member row is only ever deleted by an account
-- deletion (the RPCs move people), so a delete with people left is "left the household" for them.
create or replace function public.household_members_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.households set household_changed_at = now() where id = new.household_id;
  elsif tg_op = 'UPDATE' then
    update public.households set household_changed_at = now() where id in (old.household_id, new.household_id);
    if old.household_id <> new.household_id
       and not exists (select 1 from public.household_members m where m.household_id = old.household_id) then
      delete from public.households where id = old.household_id;
    end if;
  else
    if exists (select 1 from public.household_members m where m.household_id = old.household_id) then
      update public.households set household_changed_at = now() where id = old.household_id;
      insert into public.household_activity (household_id, kind, actor_name)
      values (old.household_id, 'member_left', old.display_name);
    else
      delete from public.households where id = old.household_id;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.household_members_changed() from public, anon, authenticated;

create trigger household_members_changed
  after insert or update of household_id, display_name or delete on public.household_members
  for each row execute function public.household_members_changed();

-- ── What the apps get ──────────────────────────────────────────────────────
-- The shape shared/lib/supabase/household.ts parses (HouseholdRow).
create or replace function public.household_json(p_household_id uuid, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'avatar', h.avatar,
    'is_set_up', h.set_up_at is not null,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', m.display_name,
        'avatar_url', p.avatar_url,
        'joined_at', m.joined_at,
        'is_me', m.user_id = p_me
      ) order by m.joined_at, m.user_id)
      from public.household_members m
      left join public.profiles p on p.id = m.user_id
      where m.household_id = h.id
    ), '[]'::jsonb),
    'staples', to_jsonb(h.staples),
    'invite', (
      select jsonb_build_object('token', i.token, 'expires_at', i.expires_at)
      from public.household_invites i
      where i.household_id = h.id and i.stopped_at is null and i.expires_at > now()
      order by i.created_at desc
      limit 1
    ),
    'going_shopping_sent_at', (
      select m.going_shopping_sent_at from public.household_members m
      where m.user_id = p_me and m.household_id = h.id
    )
  )
  from public.households h
  where h.id = p_household_id;
$$;

revoke all on function public.household_json(uuid, uuid) from public, anon, authenticated;

-- My household, locked for this transaction, with my member row. Loops if I move between reading and locking.
create or replace function public.household_lock_mine(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_check uuid;
begin
  for attempt in 1..3 loop
    v_household := public.household_ensure(p_user);
    perform 1 from public.households where id = v_household for update;
    select m.household_id into v_check from public.household_members m where m.user_id = p_user for update;
    if v_check = v_household then
      return v_household;
    end if;
  end loop;
  raise exception 'try_again';
end;
$$;

revoke all on function public.household_lock_mine(uuid) from public, anon, authenticated;

-- Moves p_user out of p_household into a new household of one (not set up) with a copy of the list, the
-- pantry (newest 600) and "Always have". Returns the new household. The caller holds the locks.
create or replace function public.household_split_off(p_household uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid;
begin
  insert into public.households (staples)
  select h.staples from public.households h where h.id = p_household
  returning id into v_new;

  update public.household_members
  set household_id = v_new, display_name = '', joined_at = now()
  where user_id = p_user and household_id = p_household;

  insert into public.shopping_list_items
    (household_id, user_id, name, quantity, unit, checked, source_recipe_ids, created_at, updated_at)
  select v_new, p_user, s.name, s.quantity, s.unit, s.checked, s.source_recipe_ids, s.created_at, s.updated_at
  from public.shopping_list_items s
  where s.household_id = p_household;

  insert into public.pantry_items
    (household_id, user_id, name, name_en, brand, place, aisle, source, added_at, last_seen_at)
  select v_new, p_user, p.name, p.name_en, p.brand, p.place, p.aisle, p.source, p.added_at, p.last_seen_at
  from public.pantry_items p
  where p.household_id = p_household
  order by p.last_seen_at desc
  limit 600;

  return v_new;
end;
$$;

revoke all on function public.household_split_off(uuid, uuid) from public, anon, authenticated;

create or replace function public.household_new_invite(p_household uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_expires timestamptz;
begin
  update public.household_invites set stopped_at = now()
  where household_id = p_household and stopped_at is null;
  insert into public.household_invites (household_id, token, created_by, expires_at)
  values (
    p_household,
    rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '='),
    p_user,
    now() + interval '7 days'
  )
  returning token, expires_at into v_token, v_expires;
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end;
$$;

revoke all on function public.household_new_invite(uuid, uuid) from public, anon, authenticated;

-- ── RPCs for the apps ──────────────────────────────────────────────────────
-- Errors are raised with the code as the message (HouseholdErrorCode in shared/types/household.ts).

create or replace function public.get_my_household()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  return public.household_json(public.household_ensure(v_uid), v_uid);
end;
$$;

create or replace function public.set_up_household(p_name text, p_avatar text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_name text := public.household_clean_text(p_name, 40);
  v_display text := public.household_clean_text(p_display_name, 30);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if v_name is null or v_display is null then raise exception 'name_required'; end if;
  if p_avatar is null or p_avatar !~ '^house:[a-z]+$' then raise exception 'invalid_avatar'; end if;
  v_household := public.household_lock_mine(v_uid);
  update public.households
  set name = v_name, avatar = p_avatar, set_up_at = coalesce(set_up_at, now())
  where id = v_household;
  update public.household_members set display_name = v_display where user_id = v_uid;
  return public.household_json(v_household, v_uid);
end;
$$;

create or replace function public.update_household(p_name text, p_avatar text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_name text := public.household_clean_text(p_name, 40);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if v_name is null then raise exception 'name_required'; end if;
  if p_avatar is null or p_avatar !~ '^house:[a-z]+$' then raise exception 'invalid_avatar'; end if;
  v_household := public.household_lock_mine(v_uid);
  if not exists (select 1 from public.households where id = v_household and set_up_at is not null) then
    raise exception 'not_set_up';
  end if;
  update public.households set name = v_name, avatar = p_avatar where id = v_household;
  return public.household_json(v_household, v_uid);
end;
$$;

create or replace function public.set_my_household_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_display text := public.household_clean_text(p_display_name, 30);
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if v_display is null then raise exception 'name_required'; end if;
  -- Household first, then my row: the order every household RPC locks in.
  v_household := public.household_lock_mine(v_uid);
  update public.household_members set display_name = v_display where user_id = v_uid;
  return public.household_json(v_household, v_uid);
end;
$$;

-- Saves "Always have". With p_previous (the list the person was looking at), only their change is applied to the
-- household's list as it is now: what they added is added, what they removed is removed (ignoring case), and what
-- someone else changed meanwhile is kept. Without it the list is replaced. Returns what was saved.
create or replace function public.set_household_staples(p_staples text[], p_previous text[] default null)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_next text[] := public.clean_household_staples(p_staples);
  v_prev text[];
  v_current text[];
  v_removed text[];
  v_added text[];
  v_staples text[];
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_household := public.household_lock_mine(v_uid);
  if p_previous is null then
    v_staples := v_next;
  else
    v_prev := public.clean_household_staples(p_previous);
    select h.staples into v_current from public.households h where h.id = v_household;
    v_removed := array(
      select lower(p) from unnest(v_prev) as p
      where lower(p) <> all (array(select lower(n) from unnest(v_next) as n))
    );
    v_added := array(
      select u.n from unnest(v_next) with ordinality as u(n, ord)
      where lower(u.n) <> all (array(select lower(p) from unnest(v_prev) as p))
      order by u.ord
    );
    v_staples := public.clean_household_staples(array(
      select u.c from unnest(v_current) with ordinality as u(c, ord)
      where lower(u.c) <> all (v_removed)
      order by u.ord
    ) || v_added);
  end if;
  update public.households
  set staples = v_staples
  where id = v_household
  returning staples into v_staples;
  return v_staples;
end;
$$;

create or replace function public.get_household_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_invite jsonb;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_household := public.household_lock_mine(v_uid);
  if not exists (select 1 from public.households where id = v_household and set_up_at is not null) then
    raise exception 'not_set_up';
  end if;
  select jsonb_build_object('token', i.token, 'expires_at', i.expires_at) into v_invite
  from public.household_invites i
  where i.household_id = v_household and i.stopped_at is null and i.expires_at > now();
  return coalesce(v_invite, public.household_new_invite(v_household, v_uid));
end;
$$;

create or replace function public.renew_household_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_household := public.household_lock_mine(v_uid);
  if not exists (select 1 from public.households where id = v_household and set_up_at is not null) then
    raise exception 'not_set_up';
  end if;
  return public.household_new_invite(v_household, v_uid);
end;
$$;

create or replace function public.stop_household_invite()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_household := public.household_lock_mine(v_uid);
  update public.household_invites set stopped_at = now()
  where household_id = v_household and stopped_at is null;
end;
$$;

-- What a link leads to. Signed out: the name, picture, who invited and how many people, never who they are.
create or replace function public.preview_household_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.household_invites%rowtype;
  v_household public.households%rowtype;
  v_count int;
  v_mine uuid;
  v_status text;
  v_members jsonb := '[]'::jsonb;
  v_invited_by jsonb;
  v_leaving jsonb;
  v_others int;
begin
  select * into v_invite from public.household_invites where token = p_token;
  if not found then
    return jsonb_build_object(
      'status', 'not_found', 'household_name', '', 'household_avatar', null, 'invited_by', null,
      'members', '[]'::jsonb, 'member_count', 0, 'leaving', null
    );
  end if;

  select * into v_household from public.households where id = v_invite.household_id;
  select count(*)::int into v_count from public.household_members where household_id = v_household.id;
  if v_uid is not null then
    select m.household_id into v_mine from public.household_members m where m.user_id = v_uid;
  end if;

  v_status := case
    when v_mine = v_household.id then 'already_member'
    when v_invite.stopped_at is not null or v_invite.expires_at <= now() then 'expired'
    when v_count >= 8 then 'full'
    else 'ok'
  end;

  select jsonb_build_object('display_name', m.display_name, 'avatar_url', p.avatar_url) into v_invited_by
  from public.household_members m
  left join public.profiles p on p.id = m.user_id
  where m.household_id = v_household.id and m.user_id = v_invite.created_by;

  if v_uid is not null and v_status <> 'expired' then
    select coalesce(jsonb_agg(jsonb_build_object('display_name', x.display_name, 'avatar_url', x.avatar_url)
                              order by x.joined_at, x.user_id), '[]'::jsonb)
    into v_members
    from (
      select m.user_id, m.display_name, m.joined_at, p.avatar_url
      from public.household_members m
      left join public.profiles p on p.id = m.user_id
      where m.household_id = v_household.id
      order by m.joined_at, m.user_id
      limit 8
    ) x;
  end if;

  if v_uid is not null and v_mine is not null and v_status in ('ok', 'full') then
    select count(*)::int - 1 into v_others from public.household_members where household_id = v_mine;
    if v_others > 0 then
      select jsonb_build_object('name', coalesce(h.name, ''), 'other_members', v_others) into v_leaving
      from public.households h where h.id = v_mine;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'household_name', coalesce(v_household.name, ''),
    'household_avatar', v_household.avatar,
    'invited_by', v_invited_by,
    'members', v_members,
    'member_count', v_count,
    'leaving', v_leaving
  );
end;
$$;

-- Joins the household behind the link. A household of one is folded in (list, pantry and "Always have" move
-- over; the same product in the same place keeps the row seen last) and deleted. From a household with other
-- people, I just leave it to them.
create or replace function public.accept_household_invite(p_token text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_display text := public.household_clean_text(p_display_name, 30);
  v_invite public.household_invites%rowtype;
  v_target uuid;
  v_mine uuid;
  v_check uuid;
  v_old_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if v_display is null then raise exception 'name_required'; end if;

  select * into v_invite from public.household_invites where token = p_token;
  if not found then raise exception 'invite_not_found'; end if;
  v_target := v_invite.household_id;
  v_mine := public.household_ensure(v_uid);
  if v_mine = v_target then raise exception 'already_member'; end if;

  -- Both households, always in the same order, so two joins can't deadlock. Then everything is read again.
  perform 1 from public.households where id in (v_mine, v_target) order by id for update;
  select m.household_id, m.display_name into v_check, v_old_name
  from public.household_members m where m.user_id = v_uid for update;
  if v_check is distinct from v_mine then raise exception 'try_again'; end if;

  select * into v_invite from public.household_invites where token = p_token;
  if not found then raise exception 'invite_not_found'; end if;
  if v_invite.stopped_at is not null or v_invite.expires_at <= now() then raise exception 'invite_expired'; end if;
  if not exists (select 1 from public.households where id = v_target and set_up_at is not null) then
    raise exception 'invite_not_found';
  end if;
  if (select count(*) from public.household_members where household_id = v_target) >= 8 then
    raise exception 'household_full';
  end if;

  if exists (select 1 from public.household_members where household_id = v_mine and user_id <> v_uid) then
    -- Leaving it this way stops its live link too, as leave_household does: no slipping back in with it, and no
    -- seeing who is there through its preview.
    update public.household_invites set stopped_at = now()
    where household_id = v_mine and stopped_at is null;
    insert into public.household_activity (household_id, kind, actor_id, actor_name)
    values (v_mine, 'member_left', v_uid, v_old_name);
  else
    -- The same product in the same place: keep whichever was seen last.
    delete from public.pantry_items t
    using public.pantry_items s
    where t.household_id = v_target and s.household_id = v_mine
      and s.place = t.place and s.name_key = t.name_key and s.last_seen_at > t.last_seen_at;
    delete from public.pantry_items s
    using public.pantry_items t
    where s.household_id = v_mine and t.household_id = v_target
      and s.place = t.place and s.name_key = t.name_key;
    update public.pantry_items set household_id = v_target where household_id = v_mine;
    -- Moves skip the 600 cap (it checks inserts), so keep the 600 seen last.
    delete from public.pantry_items p
    where p.household_id = v_target
      and p.id not in (
        select k.id from public.pantry_items k where k.household_id = v_target
        order by k.last_seen_at desc, k.id
        limit 600
      );
    update public.shopping_list_items set household_id = v_target where household_id = v_mine;
    update public.households t
    set staples = public.clean_household_staples(t.staples || s.staples)
    from public.households s
    where t.id = v_target and s.id = v_mine;
  end if;

  -- Moving the last person out deletes the old household (household_members_changed).
  update public.household_members
  set household_id = v_target, display_name = v_display, joined_at = now()
  where user_id = v_uid;

  insert into public.household_activity (household_id, kind, actor_id, actor_name)
  values (v_target, 'member_joined', v_uid, v_display);

  return public.household_json(v_target, v_uid);
exception
  -- Lost a race with another member's save (the households row, list or pantry rows): the app asks to try again.
  when deadlock_detected or serialization_failure then
    raise exception 'try_again';
end;
$$;

-- Leaves with a copy of the list, pantry and "Always have". Returns my new household of one. The live link stops,
-- so I can't slip back in with it or keep seeing who is there.
create or replace function public.leave_household()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_name text;
  v_new uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  v_household := public.household_lock_mine(v_uid);
  perform 1 from public.household_members where household_id = v_household for update;
  if (select count(*) from public.household_members where household_id = v_household) < 2 then
    raise exception 'alone';
  end if;
  select display_name into v_name from public.household_members where user_id = v_uid;
  v_new := public.household_split_off(v_household, v_uid);
  update public.household_invites set stopped_at = now()
  where household_id = v_household and stopped_at is null;
  insert into public.household_activity (household_id, kind, actor_id, actor_name)
  values (v_household, 'member_left', v_uid, v_name);
  return public.household_json(v_new, v_uid);
exception
  when deadlock_detected or serialization_failure then
    raise exception 'try_again';
end;
$$;

-- Removes someone: they get a copy and a household of their own, and everyone is told. The live link stops, so
-- the person removed can't come straight back with it.
create or replace function public.remove_household_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household uuid;
  v_name text;
  v_subject_name text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_user_id = v_uid then
    return public.leave_household();
  end if;
  v_household := public.household_lock_mine(v_uid);
  perform 1 from public.household_members where household_id = v_household for update;
  select display_name into v_subject_name
  from public.household_members where household_id = v_household and user_id = p_user_id;
  if not found then raise exception 'not_a_member'; end if;
  select display_name into v_name from public.household_members where user_id = v_uid;

  perform public.household_split_off(v_household, p_user_id);
  update public.household_invites set stopped_at = now()
  where household_id = v_household and stopped_at is null;
  insert into public.household_activity (household_id, kind, actor_id, actor_name, subject_id, subject_name)
  values (v_household, 'member_removed', v_uid, v_name, p_user_id, v_subject_name);
  return public.household_json(v_household, v_uid);
exception
  when deadlock_detected or serialization_failure then
    raise exception 'try_again';
end;
$$;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_my_household()',
    'public.set_up_household(text, text, text)',
    'public.update_household(text, text)',
    'public.set_my_household_display_name(text)',
    'public.set_household_staples(text[], text[])',
    'public.get_household_invite()',
    'public.renew_household_invite()',
    'public.stop_household_invite()',
    'public.preview_household_invite(text)',
    'public.accept_household_invite(text, text)',
    'public.leave_household()',
    'public.remove_household_member(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$grants$;

-- Invite links open signed out too.
grant execute on function public.preview_household_invite(text) to anon;

-- ── Pushes ─────────────────────────────────────────────────────────────────
-- Who a push can reach: their phones and language, or null when they turned pushes off or have no phone.
create or replace function public.household_push_target(p_user uuid, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', pr.id,
    'role', p_role,
    'locale', nullif(u.raw_user_meta_data ->> 'locale', ''),
    'push_tokens', to_jsonb(array(
      select t.token from public.push_tokens t where t.user_id = pr.id order by t.updated_at desc
    ))
  )
  from public.profiles pr
  left join auth.users u on u.id = pr.id
  where pr.id = p_user
    and not pr.push_opt_out
    and u.deleted_at is null
    and exists (select 1 from public.push_tokens t where t.user_id = pr.id);
$$;

-- The pushes due now, marked sent as they are handed out (at most once: a second run gets none of them).
-- List bursts go once the person adding has been quiet for 2 minutes (or 10 minutes after the first add);
-- people joining, leaving or being removed go on the next run. p_now is for tests.
create or replace function public.household_activity_claim(p_limit int default 50, p_now timestamptz default now())
returns table (
  id bigint,
  kind text,
  household_name text,
  actor_name text,
  subject_name text,
  item_count int,
  recipients jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Sent a month ago, or stuck for a day (the function was down): no longer worth anything.
  delete from public.household_activity a
  where (a.sent_at is not null and a.sent_at < p_now - interval '30 days')
     or (a.sent_at is null and a.created_at < p_now - interval '1 day');

  return query
  with due as (
    select a.id
    from public.household_activity a
    where a.sent_at is null
      and (
        a.kind <> 'list_added'
        or a.updated_at <= p_now - interval '2 minutes'
        or a.created_at <= p_now - interval '10 minutes'
      )
    order by a.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ),
  claimed as (
    update public.household_activity a set sent_at = p_now
    from due
    where a.id = due.id
    returning a.id, a.household_id, a.kind, a.actor_id, a.actor_name, a.subject_id, a.subject_name, a.item_count,
              a.created_at
  )
  select
    c.id,
    c.kind,
    coalesce(h.name, ''),
    -- Their name now, if they renamed themselves during a burst; the name they had, once they've left.
    coalesce(nullif((
      select m.display_name from public.household_members m
      where m.user_id = c.actor_id and m.household_id = c.household_id
    ), ''), c.actor_name),
    c.subject_name,
    c.item_count,
    coalesce((
      select jsonb_agg(t.target)
      from (
        select public.household_push_target(m.user_id, 'member') as target
        from public.household_members m
        where m.household_id = c.household_id
          and m.user_id is distinct from c.actor_id
          and m.user_id is distinct from c.subject_id
        union all
        select public.household_push_target(c.subject_id, 'subject')
        where c.kind = 'member_removed' and c.subject_id is not null
      ) t
      where t.target is not null
    ), '[]'::jsonb)
  from claimed c
  join public.households h on h.id = c.household_id
  order by c.created_at;
end;
$$;

-- For the cron job: is anything due? Keeps it from calling the function every minute for nothing.
create or replace function public.household_activity_pending()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_activity a
    where a.sent_at is null
      and (
        a.kind <> 'list_added'
        or a.updated_at <= now() - interval '2 minutes'
        or a.created_at <= now() - interval '10 minutes'
      )
  );
$$;

-- "I'm going shopping": checks and records the send in one step, and returns who to tell. Statuses: ok,
-- already_sent_today (with sent_at), alone. p_now is for tests.
create or replace function public.household_going_shopping(
  p_user_id uuid,
  p_cooldown_hours int default 20,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.household_members%rowtype;
  v_recipients jsonb;
begin
  select * into v_member from public.household_members where user_id = p_user_id for update;
  if not found
     or not exists (
       select 1 from public.household_members o
       where o.household_id = v_member.household_id and o.user_id <> p_user_id
     ) then
    return jsonb_build_object('status', 'alone');
  end if;
  if v_member.going_shopping_sent_at is not null
     and v_member.going_shopping_sent_at > p_now - make_interval(hours => greatest(coalesce(p_cooldown_hours, 20), 0)) then
    return jsonb_build_object('status', 'already_sent_today', 'sent_at', v_member.going_shopping_sent_at);
  end if;

  update public.household_members set going_shopping_sent_at = p_now where user_id = p_user_id;

  select coalesce(jsonb_agg(t.target), '[]'::jsonb) into v_recipients
  from (
    select public.household_push_target(o.user_id, 'member') as target
    from public.household_members o
    where o.household_id = v_member.household_id and o.user_id <> p_user_id
  ) t
  where t.target is not null;

  return jsonb_build_object(
    'status', 'ok',
    'sent_at', p_now,
    'actor_name', v_member.display_name,
    'household_name', (select coalesce(h.name, '') from public.households h where h.id = v_member.household_id),
    'recipients', v_recipients
  );
end;
$$;

-- The push reached nobody: give the send back, unless a newer one has been recorded since. True when cleared.
create or replace function public.household_going_shopping_failed(p_user_id uuid, p_sent_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_members set going_shopping_sent_at = null
  where user_id = p_user_id and going_shopping_sent_at = p_sent_at;
  return found;
end;
$$;

revoke all on function public.household_going_shopping_failed(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.household_going_shopping_failed(uuid, timestamptz) to service_role;

revoke all on function public.household_push_target(uuid, text) from public, anon, authenticated;
revoke all on function public.household_activity_claim(int, timestamptz) from public, anon, authenticated;
revoke all on function public.household_activity_pending() from public, anon, authenticated;
revoke all on function public.household_going_shopping(uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function public.household_activity_claim(int, timestamptz) to service_role;
grant execute on function public.household_going_shopping(uuid, int, timestamptz) to service_role;

-- ── Pantry rescan reminder, per household ──────────────────────────────────
-- As in 20261126120000_pantry, but per household: due two weeks after anyone in it last scanned, and sent only
-- to the member who scanned most recently.
create or replace function public.pantry_rescan_candidates(
  p_limit int default 50,
  p_now timestamptz default now()
)
returns table (
  user_id uuid,
  email text,
  locale text,
  recipe_id uuid,
  recipe_title text,
  unsubscribe_token text,
  push_tokens text[],
  email_sent boolean,
  push_sent boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with scans as (
    select p.household_id, max(p.last_seen_at) as last_scan
    from public.pantry_items p
    where p.source = 'scan'
    group by p.household_id
  ),
  scanner as (
    select distinct on (p.household_id) p.household_id, p.user_id
    from public.pantry_items p
    join public.household_members m on m.user_id = p.user_id and m.household_id = p.household_id
    where p.source = 'scan'
    order by p.household_id, p.last_seen_at desc, p.user_id
  ),
  due as (
    select
      u.id,
      case when u.email_confirmed_at is not null and not pr.email_opt_out then nullif(u.email::text, '') end as email,
      nullif(u.raw_user_meta_data ->> 'locale', '') as locale,
      pr.push_opt_out,
      s.last_scan
    from scans s
    join scanner sc on sc.household_id = s.household_id
    join auth.users u on u.id = sc.user_id
    join public.profiles pr on pr.id = u.id
    where s.last_scan <= p_now - interval '14 days'
      and s.last_scan > p_now - interval '45 days'
      and u.deleted_at is null
      and coalesce(u.is_anonymous, false) = false
      and not (pr.email_opt_out and pr.push_opt_out)
  )
  select
    d.id,
    d.email,
    d.locale,
    null::uuid,
    null::text,
    public.email_unsubscribe_token(d.id),
    case when d.push_opt_out then '{}'::text[] else
      coalesce((select array_agg(t.token order by t.updated_at desc) from public.push_tokens t where t.user_id = d.id), '{}')
    end,
    exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'email'),
    exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'push')
  from due d
  where (
      d.email is not null
      and not exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'email')
    )
    or (
      not d.push_opt_out
      and exists (select 1 from public.push_tokens t where t.user_id = d.id)
      and not exists (select 1 from public.nudge_sends n where n.user_id = d.id and n.kind = 'pantry_rescan' and n.channel = 'push')
    )
  order by d.last_scan
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- A scan by anyone in the household starts the clock over for everyone in it.
create or replace function public.pantry_scan_resets_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.nudge_sends n
  using public.household_members m
  where m.household_id = new.household_id and n.user_id = m.user_id and n.kind = 'pantry_rescan';
  return null;
end;
$$;

-- ── Schedule ───────────────────────────────────────────────────────────────
-- Every minute, and only when a push is due. Same secret and production URL as the nudges job; a local stack's
-- job reaches production with the local secret, which production rejects.
do $schedule$
begin
  if exists (select 1 from cron.job where jobname = 'pinch-household-activity') then
    perform cron.unschedule('pinch-household-activity');
  end if;
  perform cron.schedule(
    'pinch-household-activity',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://ccobefeofhnncpgifxel.supabase.co/functions/v1/household-activity',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-email-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
        ),
        body := '{}'::jsonb
      )
      where public.household_activity_pending();
    $job$
  );
end;
$schedule$;
