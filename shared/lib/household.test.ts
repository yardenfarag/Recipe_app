import { describe, expect, it } from 'vitest';

import type { Household, HouseholdMember } from '../types/household';
import {
  goingShoppingAvailableAt,
  isShared,
  memberInitial,
  memberWhoAdded,
  otherMembers,
  suggestDisplayName,
} from './household';

const member = (userId: string, isMe = false): HouseholdMember => ({
  userId,
  displayName: userId,
  avatarUrl: null,
  joinedAt: '2026-11-26T10:00:00Z',
  isMe,
});

const household = (members: HouseholdMember[]): Pick<Household, 'members'> => ({ members });

describe('isShared / otherMembers', () => {
  it('a household of one is not shared', () => {
    expect(isShared(household([member('me', true)]))).toBe(false);
    expect(otherMembers(household([member('me', true)]))).toEqual([]);
  });

  it('two people share', () => {
    const h = household([member('me', true), member('omer')]);
    expect(isShared(h)).toBe(true);
    expect(otherMembers(h).map((m) => m.userId)).toEqual(['omer']);
  });
});

describe('memberWhoAdded', () => {
  const h = household([member('me', true), member('omer')]);

  it('names the other member who added a row', () => {
    expect(memberWhoAdded(h, 'omer')?.userId).toBe('omer');
  });

  it('says nothing for my own rows, for someone who left, or when alone', () => {
    expect(memberWhoAdded(h, 'me')).toBeNull();
    expect(memberWhoAdded(h, 'gone')).toBeNull();
    expect(memberWhoAdded(household([member('me', true)]), 'me')).toBeNull();
  });
});

describe('suggestDisplayName', () => {
  it('takes the first name from the full name', () => {
    expect(suggestDisplayName({ fullName: '  Dana   Cohen ', email: 'x@y.z' })).toBe('Dana');
  });

  it('falls back to the start of the email', () => {
    expect(suggestDisplayName({ email: 'dana.cohen@gmail.com' })).toBe('Dana');
    expect(suggestDisplayName({ email: '123.omer99@gmail.com' })).toBe('Omer');
  });

  it('gives nothing when there is nothing to go on', () => {
    expect(suggestDisplayName({ email: '1234@x.com' })).toBe('');
    expect(suggestDisplayName({})).toBe('');
  });
});

describe('goingShoppingAvailableAt', () => {
  const now = new Date('2026-11-26T12:00:00Z');

  it('can be sent when never sent or sent long ago', () => {
    expect(goingShoppingAvailableAt(null, now)).toBeNull();
    expect(goingShoppingAvailableAt('2026-11-25T15:00:00Z', now)).toBeNull();
  });

  it('waits 20 hours after the last one', () => {
    expect(goingShoppingAvailableAt('2026-11-26T08:00:00Z', now)?.toISOString()).toBe('2026-11-27T04:00:00.000Z');
  });
});

describe('memberInitial', () => {
  it('upper-cases the first letter', () => {
    expect(memberInitial(' dana')).toBe('D');
    expect(memberInitial('')).toBe('?');
  });
});
