import { afterEach, describe, expect, it } from 'vitest';

import { claimShare, releaseShareClaim } from './shareIntentClaim';

describe('shareIntentClaim', () => {
  afterEach(() => releaseShareClaim());

  it('lets only the first caller take a share', () => {
    const url = 'https://www.instagram.com/reel/Dft4VRhOU71/';
    expect(claimShare(url)).toBe(true);
    expect(claimShare(url)).toBe(false);
    expect(claimShare(url)).toBe(false);
  });

  it('lets a different share be taken', () => {
    expect(claimShare('https://www.instagram.com/reel/a/')).toBe(true);
    expect(claimShare('https://www.instagram.com/reel/b/')).toBe(true);
  });

  it('lets the same link be taken again after the share is cleared', () => {
    const url = 'https://www.tiktok.com/@cook/video/1';
    expect(claimShare(url)).toBe(true);
    releaseShareClaim();
    expect(claimShare(url)).toBe(true);
  });
});
