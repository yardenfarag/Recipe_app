import type { Household, HouseholdMember } from "@shared/types/household";

/** Test fixtures: people and households as fetchHousehold returns them. */
export const member = (over: Partial<HouseholdMember> = {}): HouseholdMember => ({
  userId: "me",
  displayName: "Dana",
  avatarUrl: null,
  joinedAt: "2026-11-01T10:00:00Z",
  isMe: true,
  ...over,
});

export const avi = member({ userId: "u2", displayName: "Avi", avatarUrl: "food:pizza", isMe: false, joinedAt: "2026-11-10T10:00:00Z" });
export const noa = member({ userId: "u3", displayName: "Noa", isMe: false, joinedAt: "2026-11-12T10:00:00Z" });

export const household = (over: Partial<Household> = {}): Household => ({
  id: "h1",
  name: "The Cohens",
  avatar: "house:teapot",
  isSetUp: true,
  members: [member()],
  staples: [],
  invite: null,
  goingShoppingSentAt: null,
  ...over,
});

export const notSetUp = (): Household => household({ name: null, avatar: null, isSetUp: false });
