/**
 * Household helpers both apps use (docs/adr/034-households.md). Pure: no Supabase, no platform.
 */
import {
  GOING_SHOPPING_COOLDOWN_HOURS,
  HOUSEHOLD_DISPLAY_NAME_MAX,
  HOUSEHOLD_MAX_MEMBERS,
  type Household,
  type HouseholdMember,
} from '../types/household';

/** True when someone else lives here too, which is when the household UI (avatars, "added by", pushes) matters. */
export function isShared(household: Pick<Household, 'members'> | null | undefined): boolean {
  return (household?.members.length ?? 0) > 1;
}

export function otherMembers(household: Pick<Household, 'members'> | null | undefined): HouseholdMember[] {
  return household?.members.filter((member) => !member.isMe) ?? [];
}

export function isHouseholdFull(household: Pick<Household, 'members'>): boolean {
  return household.members.length >= HOUSEHOLD_MAX_MEMBERS;
}

/** The member who added a row (its `user_id`), for "Added by". Null for me, or someone who has since left. */
export function memberWhoAdded(
  household: Pick<Household, 'members'> | null | undefined,
  userId: string | null | undefined,
): HouseholdMember | null {
  if (!household || !userId || !isShared(household)) return null;
  const member = household.members.find((m) => m.userId === userId);
  return member && !member.isMe ? member : null;
}

/**
 * A first guess at the name the household sees: the account's own name, else the start of the email
 * ("dana.cohen@…" → "Dana"). The person can change it before saving.
 */
export function suggestDisplayName(input: { fullName?: string | null; email?: string | null }): string {
  const full = input.fullName?.trim().replace(/\s+/g, ' ');
  if (full) return full.split(' ')[0].slice(0, HOUSEHOLD_DISPLAY_NAME_MAX);
  const local = input.email?.split('@')[0] ?? '';
  const first = local.split(/[._+-]/).find((part) => /\p{L}/u.test(part)) ?? '';
  const letters = first.replace(/[^\p{L}]/gu, '');
  if (!letters) return '';
  return (letters[0].toLocaleUpperCase() + letters.slice(1)).slice(0, HOUSEHOLD_DISPLAY_NAME_MAX);
}

/** When "I'm going shopping" can be sent again, or null if it can be sent now. */
export function goingShoppingAvailableAt(sentAt: string | null | undefined, now: Date = new Date()): Date | null {
  if (!sentAt) return null;
  const next = new Date(new Date(sentAt).getTime() + GOING_SHOPPING_COOLDOWN_HOURS * 3600_000);
  return next > now ? next : null;
}

/** Initials for a member without a picture. */
export function memberInitial(displayName: string): string {
  const first = displayName.trim()[0];
  return first ? first.toLocaleUpperCase() : '?';
}
