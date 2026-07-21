/**
 * Pinch design tokens — spacing/fonts + default Mist Colors fallback.
 * Live UI should read colors from `useThemePreference()` so theme packs apply.
 */

import '@/global.css';

import { Platform } from 'react-native';

import {
  DEFAULT_THEME_PACK,
  ThemePacks,
  type ThemePackColors,
} from '@/constants/themes';

const pack = ThemePacks[DEFAULT_THEME_PACK];

/** @deprecated Prefer useThemePreference().colors — kept for template leftovers. */
export const Colors = {
  light: pack.light,
  dark: pack.dark,
} as const;

type StringColorKey<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

export type ThemeColor = StringColorKey<ThemePackColors>;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
