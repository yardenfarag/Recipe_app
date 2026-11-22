import { describe, expect, it } from 'vitest';

import { createAuthActivityTracker } from './authActivity';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const session = (id: string, createdAt: string, provider?: string) => ({
  user: { id, created_at: createdAt, app_metadata: provider ? { provider } : {} },
});

describe('createAuthActivityTracker', () => {
  it('does not count a restored session, and logs a later sign-in of another user once', () => {
    const track = createAuthActivityTracker(() => NOW);
    expect(track('INITIAL_SESSION', session('a', '2026-01-01T00:00:00Z'))).toBeNull();
    expect(track('SIGNED_IN', session('a', '2026-01-01T00:00:00Z'))).toBeNull();
    expect(track('SIGNED_OUT', null)).toBeNull();
    expect(track('SIGNED_IN', session('a', '2026-01-01T00:00:00Z', 'google'))).toEqual({
      name: 'auth.login',
      properties: { method: 'google' },
    });
    expect(track('SIGNED_IN', session('a', '2026-01-01T00:00:00Z'))).toBeNull();
    expect(track('TOKEN_REFRESHED', session('a', '2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('counts an account made in the last two minutes as a signup, by email when no provider is given', () => {
    const track = createAuthActivityTracker(() => NOW);
    track('INITIAL_SESSION', null);
    expect(track('SIGNED_IN', session('b', new Date(NOW - 30_000).toISOString()))).toEqual({
      name: 'auth.signup',
      properties: { method: 'email' },
    });
  });

  it('keeps only a clean provider name', () => {
    const track = createAuthActivityTracker(() => NOW);
    expect(track('SIGNED_IN', session('c', '2026-01-01T00:00:00Z', 'Evil <b>name</b> that is long'))?.properties.method).toBe(
      'vilbnamebthatislong',
    );
  });
});
