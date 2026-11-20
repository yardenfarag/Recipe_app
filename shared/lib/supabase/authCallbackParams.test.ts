import { describe, expect, it } from 'vitest';

import { parseAuthCallbackParams } from './authCallbackParams';

describe('parseAuthCallbackParams', () => {
  it('reads PKCE code from query', () => {
    expect(parseAuthCallbackParams('pinch://reset-password?code=abc123')).toEqual({
      code: 'abc123',
      accessToken: undefined,
      refreshToken: undefined,
      tokenHash: undefined,
      type: undefined,
    });
  });

  it('reads implicit-flow tokens from hash fragments', () => {
    expect(
      parseAuthCallbackParams(
        'pinch://reset-password#access_token=at&refresh_token=rt&type=recovery',
      ),
    ).toEqual({
      code: undefined,
      accessToken: 'at',
      refreshToken: 'rt',
      tokenHash: undefined,
      type: 'recovery',
    });
  });

  it('reads token_hash for verifyOtp recovery links', () => {
    expect(
      parseAuthCallbackParams('pinch://reset-password?token_hash=thash&type=recovery'),
    ).toEqual({
      code: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      tokenHash: 'thash',
      type: 'recovery',
    });
  });
});
