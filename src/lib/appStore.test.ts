import { describe, expect, it, vi } from 'vitest';

import { APP_STORE_URL, PLAY_STORE_URL, storeUrlFor } from '@/lib/appStore';

vi.mock('expo-linking', () => ({ openURL: vi.fn() }));

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('storeUrlFor', () => {
  it('sends the Android app to Google Play and the iPhone app to the App Store', () => {
    expect(storeUrlFor('android')).toBe(PLAY_STORE_URL);
    expect(storeUrlFor('ios')).toBe(APP_STORE_URL);
  });

  it('picks the store from the browser on the website', () => {
    expect(storeUrlFor('web', ANDROID_CHROME)).toBe(PLAY_STORE_URL);
    expect(storeUrlFor('web', IPHONE_SAFARI)).toBe(APP_STORE_URL);
    expect(storeUrlFor('web')).toBe(APP_STORE_URL);
  });
});
