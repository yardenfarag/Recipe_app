/**
 * Households: the people who live together share one shopping list, one pantry and one "Always have" list.
 * Recipes, credits and appliances stay with each person. Every member is equal (anyone can invite, rename,
 * change the picture or remove someone). See docs/adr/034-households.md.
 *
 * Everyone always has a household. Until it is set up it is a household of one with no name, and the apps
 * show no household UI beyond the invitation to set one up.
 */

export const HOUSEHOLD_MAX_MEMBERS = 8;
export const HOUSEHOLD_NAME_MAX = 40;
export const HOUSEHOLD_DISPLAY_NAME_MAX = 30;
/** How long an invite link works after it is made. */
export const HOUSEHOLD_INVITE_DAYS = 7;
/** "I'm going shopping" can be sent once in this many hours. */
export const GOING_SHOPPING_COOLDOWN_HOURS = 20;

export type HouseholdMember = {
  userId: string;
  /** The name this person chose for the household. */
  displayName: string;
  /** Their profile picture: `food:<id>`, a photo URL, or null. */
  avatarUrl: string | null;
  joinedAt: string;
  isMe: boolean;
};

export type HouseholdInvite = {
  token: string;
  expiresAt: string;
};

export type Household = {
  id: string;
  /** Null until the household is set up. */
  name: string | null;
  /** `house:<id>` from householdAvatars, or null until set up. */
  avatar: string | null;
  isSetUp: boolean;
  /** Oldest first; always includes me. */
  members: HouseholdMember[];
  /** The household's "Always have" list. */
  staples: string[];
  /** The live invite link, if one was made and has not expired or been stopped. */
  invite: HouseholdInvite | null;
  /** When I last sent "I'm going shopping", or null. */
  goingShoppingSentAt: string | null;
};

export type InvitePreviewStatus = 'ok' | 'expired' | 'full' | 'not_found' | 'already_member';

export type InvitePreview = {
  status: InvitePreviewStatus;
  /** Empty for not_found. */
  householdName: string;
  householdAvatar: string | null;
  /** Who made the link. */
  invitedBy: { displayName: string; avatarUrl: string | null } | null;
  /** Up to HOUSEHOLD_MAX_MEMBERS, oldest first. Empty for signed-out visitors and not_found. */
  members: { displayName: string; avatarUrl: string | null }[];
  memberCount: number;
  /**
   * Signed in only: the household I would leave by joining, when it has other people in it. A household of
   * one is simply folded into the new one, so this is null then.
   */
  leaving: { name: string; otherMembers: number } | null;
};

/** Errors the household calls can fail with, as `code` on HouseholdError. */
export type HouseholdErrorCode =
  | 'not_signed_in'
  | 'not_set_up'
  | 'name_required'
  | 'invite_expired'
  | 'invite_not_found'
  | 'household_full'
  | 'already_member'
  | 'not_a_member'
  | 'already_sent_today'
  | 'alone'
  /** The picture isn't one of the household avatars. */
  | 'invalid_avatar'
  /** Someone switched household in the middle of the call; doing it again works. */
  | 'try_again'
  | 'unknown';
