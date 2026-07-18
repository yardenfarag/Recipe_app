import { describe, expect, it } from 'vitest';

import {
  canonicalInstagramUrl,
  instagramFetchUrlCandidates,
  instagramPathKind,
  sanitizeInstagramUrl,
} from '@/lib/instagramUrls';

describe('instagramPathKind', () => {
  it('detects post, reel, and tv paths', () => {
    expect(instagramPathKind('https://www.instagram.com/p/C9NM7x_sM-H/')).toBe('p');
    expect(instagramPathKind('https://www.instagram.com/reel/C9NM7x_sM-H/')).toBe('reel');
    expect(instagramPathKind('https://www.instagram.com/tv/C9NM7x_sM-H/')).toBe('tv');
  });
});

describe('sanitizeInstagramUrl', () => {
  it('preserves /p/ paths and strips query params', () => {
    expect(
      sanitizeInstagramUrl('https://www.instagram.com/p/C9NM7x_sM-H/?igsh=abc123'),
    ).toBe('https://www.instagram.com/p/C9NM7x_sM-H/');
  });

  it('preserves reel paths', () => {
    expect(
      sanitizeInstagramUrl('https://www.instagram.com/reel/DZ7cxYuJRlP/?igsh=abc'),
    ).toBe('https://www.instagram.com/reel/DZ7cxYuJRlP/');
  });
});

describe('instagramFetchUrlCandidates', () => {
  it('tries /p/ first for post URLs then /reel/', () => {
    expect(
      instagramFetchUrlCandidates('https://www.instagram.com/p/C9NM7x_sM-H/'),
    ).toEqual([
      'https://www.instagram.com/p/C9NM7x_sM-H/',
      'https://www.instagram.com/reel/C9NM7x_sM-H/',
    ]);
  });

  it('tries /reel/ first for reel URLs then /p/', () => {
    expect(
      instagramFetchUrlCandidates('https://www.instagram.com/reel/DZ7cxYuJRlP/'),
    ).toEqual([
      'https://www.instagram.com/reel/DZ7cxYuJRlP/',
      'https://www.instagram.com/p/DZ7cxYuJRlP/',
    ]);
  });
});

describe('canonicalInstagramUrl', () => {
  it('uses /p/ for stable dedup', () => {
    expect(canonicalInstagramUrl('C9NM7x_sM-H')).toBe(
      'https://www.instagram.com/p/C9NM7x_sM-H/',
    );
  });
});
