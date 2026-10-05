-- Free-text feedback from Settings → "Send feedback". Separate from support_tickets:
-- tickets are problems to resolve, feedback is opinions to read.
-- Signed-in users insert their own rows; only admins can read them.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Kept (as null) when the account is deleted so the feedback itself survives.
  user_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(message) between 2 and 4000),
  app_version text,
  build_number text,
  platform text not null check (platform in ('ios', 'android', 'web')),
  os_version text,
  device_model text,
  locale text,
  created_at timestamptz not null default now()
);

comment on table public.feedback is
  'In-app feedback with the app version and device it was sent from. Insert-only for users; admins read.';

create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_user_id_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

create policy "Signed-in users insert their own feedback"
  on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

create policy "Admins read feedback"
  on public.feedback for select to authenticated
  using (public.is_current_user_admin());

grant insert, select on public.feedback to authenticated;
