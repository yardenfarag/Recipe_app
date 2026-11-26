import { describe, expect, it } from 'vitest';

import {
  formatSendAgain,
  formatShortDate,
  inviteExpired,
  joinNames,
  stackMembers,
  whatsappUrls,
} from './householdHelpers';

describe('formatShortDate', () => {
  it('writes the day and month in the app language', () => {
    expect(formatShortDate('2026-12-03T10:00:00Z', 'en')).toMatch(/3/);
    expect(formatShortDate('2026-12-03T10:00:00Z', 'en')).toMatch(/Dec/);
  });

  it('returns nothing for a date it cannot read', () => {
    expect(formatShortDate('not a date', 'en')).toBe('');
  });
});

describe('formatSendAgain', () => {
  const now = new Date('2026-11-26T08:00:00Z');

  it('says how many hours are left', () => {
    expect(formatSendAgain(new Date('2026-11-27T03:00:00Z'), now, 'en')).toBe('in 19 hours');
  });

  it('counts minutes in the last hour, and never less than one', () => {
    expect(formatSendAgain(new Date('2026-11-26T08:25:00Z'), now, 'en')).toBe('in 25 minutes');
    expect(formatSendAgain(new Date('2026-11-26T08:00:10Z'), now, 'en')).toBe('in 1 minute');
  });
});

describe('joinNames', () => {
  it('joins names the way the language lists them', () => {
    expect(joinNames(['Dana'], 'en')).toBe('Dana');
    expect(joinNames(['Dana', 'Avi'], 'en')).toBe('Dana and Avi');
    expect(joinNames(['Dana', ' Avi ', '', 'Noa'], 'en')).toBe('Dana, Avi, and Noa');
  });
});

describe('stackMembers', () => {
  it('shows everyone when they fit', () => {
    expect(stackMembers(['a', 'b', 'c'], 3)).toEqual({ shown: ['a', 'b', 'c'], extra: 0 });
  });

  it('keeps a slot for the +N bubble', () => {
    expect(stackMembers(['a', 'b', 'c', 'd', 'e'], 3)).toEqual({ shown: ['a', 'b'], extra: 3 });
  });
});

describe('whatsappUrls', () => {
  it('encodes the text for the app and the web fallback', () => {
    const urls = whatsappUrls('Join us: https://pinch-app.io/app/join/abc?x=1&y=2');
    expect(urls.app).toBe(
      'whatsapp://send?text=Join%20us%3A%20https%3A%2F%2Fpinch-app.io%2Fapp%2Fjoin%2Fabc%3Fx%3D1%26y%3D2',
    );
    expect(urls.web.startsWith('https://wa.me/?text=Join%20us')).toBe(true);
  });
});

describe('inviteExpired', () => {
  const now = new Date('2026-11-26T08:00:00Z');
  it('is true once the time has passed or the date is unreadable', () => {
    expect(inviteExpired('2026-11-26T07:59:59Z', now)).toBe(true);
    expect(inviteExpired('garbage', now)).toBe(true);
    expect(inviteExpired('2026-12-03T08:00:00Z', now)).toBe(false);
  });
});
