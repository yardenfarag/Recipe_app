import { Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { textDirectionStyle } from './Text';

// vi.mock is hoisted above the imports.
vi.mock('@/hooks/useThemePreference', () => ({ useThemePreference: () => ({ colors: {} }) }));
vi.mock('@/hooks/useTypography', () => ({ useTypography: () => ({ variant: () => ({}) }) }));
vi.mock('@/hooks/useRtl', () => ({ useRtl: () => ({ rtl: false }) }));
vi.mock('./tokens', () => ({ usePhotoColors: () => ({}) }));

const realPlatform = Platform.OS;

afterEach(() => {
  Platform.OS = realPlatform;
});

describe('textDirectionStyle', () => {
  it('on the phone, pins the direction and asks for the logical side React Native mirrors in RTL', () => {
    for (const os of ['ios', 'android'] as const) {
      Platform.OS = os;
      expect(textDirectionStyle(true)).toEqual({ textAlign: 'left', writingDirection: 'rtl', direction: 'rtl' });
      expect(textDirectionStyle(true, 'end')).toEqual({ textAlign: 'right', writingDirection: 'rtl', direction: 'rtl' });
      expect(textDirectionStyle(false)).toEqual({ textAlign: 'left', writingDirection: 'ltr', direction: 'ltr' });
      expect(textDirectionStyle(false, 'end')).toEqual({ textAlign: 'right', writingDirection: 'ltr', direction: 'ltr' });
    }
  });

  it('on the web, gives the physical side, which the browser does not mirror', () => {
    Platform.OS = 'web';
    expect(textDirectionStyle(true)).toEqual({ textAlign: 'right', writingDirection: 'rtl' });
    expect(textDirectionStyle(true, 'end')).toEqual({ textAlign: 'left', writingDirection: 'rtl' });
    expect(textDirectionStyle(false)).toEqual({ textAlign: 'left', writingDirection: 'ltr' });
  });

  it('centres in either language', () => {
    expect(textDirectionStyle(true, 'center')).toEqual({ textAlign: 'center', writingDirection: 'rtl' });
  });
});
