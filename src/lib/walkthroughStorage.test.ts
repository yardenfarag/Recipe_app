import { describe, expect, it } from 'vitest';

import {
  isWalkthroughPendingValue,
  nextWalkthroughStep,
  tabItemFrame,
} from '@/lib/walkthroughStorage';

describe('isWalkthroughPendingValue', () => {
  it('is true only while the walkthrough is armed', () => {
    expect(isWalkthroughPendingValue('pending')).toBe(true);
    expect(isWalkthroughPendingValue('done')).toBe(false);
    expect(isWalkthroughPendingValue(null)).toBe(false);
  });
});

describe('nextWalkthroughStep', () => {
  it('goes Snap, share, Library, then ends', () => {
    expect(nextWalkthroughStep('snap')).toBe('share');
    expect(nextWalkthroughStep('share')).toBe('library');
    expect(nextWalkthroughStep('library')).toBeNull();
  });
});

describe('tabItemFrame', () => {
  it('places Snap in the middle either way', () => {
    expect(tabItemFrame('snap', 400, false)).toEqual({ left: 160, width: 80 });
    expect(tabItemFrame('snap', 400, true)).toEqual({ left: 160, width: 80 });
  });

  it('mirrors Library in RTL', () => {
    expect(tabItemFrame('library', 400, false)).toEqual({ left: 0, width: 80 });
    expect(tabItemFrame('library', 400, true)).toEqual({ left: 320, width: 80 });
  });
});
