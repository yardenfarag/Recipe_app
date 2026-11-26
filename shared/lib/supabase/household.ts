/**
 * Households (docs/adr/034-households.md): every call goes through a security-definer RPC, because they read
 * and change other people's rows (members, invites). "I'm going shopping" goes through an Edge Function,
 * because it sends pushes. Shared rows (list, pantry) are read directly under RLS as before; this module only
 * adds the live updates for them.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import type {
  Household,
  HouseholdErrorCode,
  HouseholdInvite,
  HouseholdMember,
  InvitePreview,
  InvitePreviewStatus,
} from '../../types/household';
import { supabase } from './client';

const KNOWN_CODES: readonly HouseholdErrorCode[] = [
  'not_signed_in',
  'not_set_up',
  'name_required',
  'invite_expired',
  'invite_not_found',
  'household_full',
  'already_member',
  'not_a_member',
  'already_sent_today',
  'alone',
  'invalid_avatar',
  'try_again',
];

export class HouseholdError extends Error {
  constructor(
    readonly code: HouseholdErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HouseholdError';
  }
}

/** The RPCs raise their code as the exception message (`raise exception 'household_full'`). */
function toHouseholdError(error: { message?: string } | null | undefined): HouseholdError {
  const message = error?.message ?? '';
  const code = KNOWN_CODES.find((known) => message === known || message.startsWith(`${known}:`));
  return new HouseholdError(code ?? 'unknown', message || undefined);
}

// The RPCs are typed once `npm run db:types` has run against the households migration; until then, and to keep
// this module's surface independent of the generated names, they are called through one untyped seam.
type RpcResult = { data: unknown; error: { message?: string } | null };
const rpc = (fn: string, args?: Record<string, unknown>): Promise<RpcResult> =>
  (supabase.rpc as unknown as (name: string, params?: Record<string, unknown>) => Promise<RpcResult>)(fn, args);

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw toHouseholdError(error);
  return data as T;
}

type MemberRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
  is_me: boolean;
};

type HouseholdRow = {
  id: string;
  name: string | null;
  avatar: string | null;
  is_set_up: boolean;
  members: MemberRow[] | null;
  staples: string[] | null;
  invite: { token: string; expires_at: string } | null;
  going_shopping_sent_at: string | null;
};

type PreviewRow = {
  status: InvitePreviewStatus;
  household_name: string | null;
  household_avatar: string | null;
  invited_by: { display_name: string; avatar_url: string | null } | null;
  members: { display_name: string; avatar_url: string | null }[] | null;
  member_count: number | null;
  leaving: { name: string; other_members: number } | null;
};

function toMember(row: MemberRow): HouseholdMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    joinedAt: row.joined_at,
    isMe: row.is_me,
  };
}

export function toHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    isSetUp: row.is_set_up,
    members: (row.members ?? []).map(toMember),
    staples: row.staples ?? [],
    invite: row.invite ? { token: row.invite.token, expiresAt: row.invite.expires_at } : null,
    goingShoppingSentAt: row.going_shopping_sent_at,
  };
}

function toPreview(row: PreviewRow): InvitePreview {
  return {
    status: row.status,
    householdName: row.household_name ?? '',
    householdAvatar: row.household_avatar,
    invitedBy: row.invited_by
      ? { displayName: row.invited_by.display_name, avatarUrl: row.invited_by.avatar_url }
      : null,
    members: (row.members ?? []).map((m) => ({ displayName: m.display_name, avatarUrl: m.avatar_url })),
    memberCount: row.member_count ?? 0,
    leaving: row.leaving ? { name: row.leaving.name, otherMembers: row.leaving.other_members } : null,
  };
}

/** My household, set up or not. */
export async function fetchHousehold(): Promise<Household> {
  return toHousehold(await call<HouseholdRow>('get_my_household'));
}

/** Names the household and gives it a picture; the first step of sharing. Also sets my name in it. */
export async function setUpHousehold(input: { name: string; avatar: string; displayName: string }): Promise<Household> {
  return toHousehold(
    await call<HouseholdRow>('set_up_household', {
      p_name: input.name,
      p_avatar: input.avatar,
      p_display_name: input.displayName,
    }),
  );
}

/** Any member can rename the household or change its picture. */
export async function updateHousehold(input: { name: string; avatar: string }): Promise<Household> {
  return toHousehold(await call<HouseholdRow>('update_household', { p_name: input.name, p_avatar: input.avatar }));
}

/** The name the others see for me. */
export async function setMyDisplayName(displayName: string): Promise<Household> {
  return toHousehold(await call<HouseholdRow>('set_my_household_display_name', { p_display_name: displayName }));
}

/**
 * Saves the household's "Always have" list. Pass `previous`, the list the change was made on, and only that change
 * is applied to the list as it is on the server now (what was added is added, what was removed is removed), so
 * someone else's change made meanwhile is kept. Without it the list is replaced. Returns what was saved (trimmed,
 * deduplicated, capped).
 */
export async function setHouseholdStaples(staples: string[], previous?: string[]): Promise<string[]> {
  const args: Record<string, unknown> = { p_staples: staples };
  if (previous) args.p_previous = previous;
  return (await call<string[] | null>('set_household_staples', args)) ?? [];
}

/** The live invite link, made if there is none. Needs a set-up household. */
export async function getHouseholdInvite(): Promise<HouseholdInvite> {
  const row = await call<{ token: string; expires_at: string }>('get_household_invite');
  return { token: row.token, expiresAt: row.expires_at };
}

/** A new link; the old one stops working. */
export async function renewHouseholdInvite(): Promise<HouseholdInvite> {
  const row = await call<{ token: string; expires_at: string }>('renew_household_invite');
  return { token: row.token, expiresAt: row.expires_at };
}

/** Stops the live link. */
export async function stopHouseholdInvite(): Promise<void> {
  await call<null>('stop_household_invite');
}

/** What an invite link leads to. Works signed out too (name, picture, who invited, how many people). */
export async function previewHouseholdInvite(token: string): Promise<InvitePreview> {
  return toPreview(await call<PreviewRow>('preview_household_invite', { p_token: token }));
}

/**
 * Joins the household behind the link. My list, pantry and "Always have" move into it (duplicates folded).
 * If my old household had other people, I leave it and they keep it.
 */
export async function acceptHouseholdInvite(token: string, displayName: string): Promise<Household> {
  return toHousehold(
    await call<HouseholdRow>('accept_household_invite', { p_token: token, p_display_name: displayName }),
  );
}

/** Leaves the household with a copy of its list, pantry and "Always have". Returns my new household of one. */
export async function leaveHousehold(): Promise<Household> {
  return toHousehold(await call<HouseholdRow>('leave_household'));
}

/** Removes someone; they get a copy and a household of their own, and everyone is told. */
export async function removeHouseholdMember(userId: string): Promise<Household> {
  return toHousehold(await call<HouseholdRow>('remove_household_member', { p_user_id: userId }));
}

/** Tells the others "I'm going shopping". Once in GOING_SHOPPING_COOLDOWN_HOURS. Returns how many were notified. */
export async function sendGoingShopping(): Promise<{ notified: number; sentAt: string }> {
  const { data, error } = await supabase.functions.invoke('household-going-shopping', { body: {} });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { code?: string } | null;
      if (body?.code) throw toHouseholdError({ message: body.code });
    }
    throw new HouseholdError('unknown', error.message);
  }
  const body = data as { notified?: number; sent_at?: string };
  return { notified: body.notified ?? 0, sentAt: body.sent_at ?? new Date().toISOString() };
}

/** The link people open to join. `origin` is the site (https://pinch-app.io), not the app's base path. */
export function householdInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/app/join/${encodeURIComponent(token)}`;
}

/** The token in an invite link or a pasted code, or null. Accepts the full link, `/app/join/<t>` or the bare token. */
export function inviteTokenFrom(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\/join\/([A-Za-z0-9_-]{16,128})/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{16,128}$/.test(trimmed) ? trimmed : null;
}

export type HouseholdChange = 'list' | 'pantry' | 'household';

type ChangeStamps = {
  list_changed_at?: string | null;
  pantry_changed_at?: string | null;
  household_changed_at?: string | null;
};

/**
 * Live updates for the household: calls `onChange` when anyone changes the list, the pantry, or the household
 * itself (members, name, picture, "Always have").
 *
 * Realtime cannot filter delete events, so the apps don't watch the list and pantry tables. Triggers stamp
 * `households.list_changed_at` / `pantry_changed_at` / `household_changed_at` on every change instead, and this
 * watches that one row. The apps refetch on a change rather than applying rows, so their own merge and
 * pending-save rules stay in charge. Returns the unsubscribe.
 */
export function subscribeToHousehold(householdId: string, onChange: (what: HouseholdChange) => void): () => void {
  let last: ChangeStamps | null = null;
  const channel = supabase
    .channel(`household:${householdId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
      (payload: { new: ChangeStamps }) => {
        const next = payload.new;
        const before = last;
        last = next;
        // The first event has nothing to compare with: report everything that has a stamp.
        if (!before || next.list_changed_at !== before.list_changed_at) onChange('list');
        if (!before || next.pantry_changed_at !== before.pantry_changed_at) onChange('pantry');
        if (!before || next.household_changed_at !== before.household_changed_at) onChange('household');
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
