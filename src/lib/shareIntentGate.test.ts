import { describe, expect, it } from 'vitest';

import { resolveShareIntentAction } from '@/lib/shareIntentGate';

describe('resolveShareIntentAction', () => {
  it('waits while auth is still hydrating on cold start', () => {
    expect(
      resolveShareIntentAction({ authLoading: true, signedIn: false, hasPayload: true }),
    ).toBe('wait');
  });

  it('waits until the share payload is present', () => {
    expect(
      resolveShareIntentAction({ authLoading: false, signedIn: true, hasPayload: false }),
    ).toBe('wait');
  });

  it('consumes once auth has loaded a session', () => {
    expect(
      resolveShareIntentAction({ authLoading: false, signedIn: true, hasPayload: true }),
    ).toBe('consume');
  });

  it('asks guests for an account without dropping the share', () => {
    expect(
      resolveShareIntentAction({ authLoading: false, signedIn: false, hasPayload: true }),
    ).toBe('require_account');
  });
});
