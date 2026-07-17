/**
 * Pinch design tokens — soft berry rose + sky accent, light & dark.
 */

import '@/global.css';

import { Platform } from 'react-native';

import {
  pinchBg,
  pinchBgDark,
  pinchBorder,
  pinchBorderDark,
  pinchDark,
  pinchMuted,
  pinchMutedDark,
  pinchPrimary,
  pinchPrimaryDark,
  pinchPrimarySoft,
  pinchPrimarySoftDark,
  pinchRose,
  pinchRoseDark,
  pinchRoseSoft,
  pinchRoseSoftDark,
  pinchSurface,
  pinchSurfaceDark,
  pinchTextDark,
} from '@/constants/brandColors';

export const Colors = {
  light: {
    text: pinchDark,
    textSecondary: pinchMuted,
    background: pinchBg,
    surface: pinchSurface,
    surfaceSoft: pinchPrimarySoft,
    backgroundElement: pinchPrimarySoft,
    backgroundSelected: '#E8C4D0',
    primary: pinchPrimary,
    primarySoft: pinchPrimarySoft,
    accent: pinchRose,
    accentSoft: pinchRoseSoft,
    border: pinchBorder,
    danger: '#C45C5C',
    dangerSoft: '#FCE8E8',
    warning: '#B8860B',
    warningSoft: '#FBF3D9',
    success: pinchPrimary,
    successSoft: pinchPrimarySoft,
    tabBar: pinchSurface,
    overlay: 'rgba(42, 36, 40, 0.45)',
  },
  dark: {
    text: pinchTextDark,
    textSecondary: pinchMutedDark,
    background: pinchBgDark,
    surface: pinchSurfaceDark,
    surfaceSoft: pinchPrimarySoftDark,
    backgroundElement: pinchPrimarySoftDark,
    backgroundSelected: '#4A3540',
    primary: pinchPrimaryDark,
    primarySoft: pinchPrimarySoftDark,
    accent: pinchRoseDark,
    accentSoft: pinchRoseSoftDark,
    border: pinchBorderDark,
    danger: '#E88A8A',
    dangerSoft: '#3A2424',
    warning: '#E8C96A',
    warningSoft: '#3A3420',
    success: pinchPrimaryDark,
    successSoft: pinchPrimarySoftDark,
    tabBar: '#1A1518',
    overlay: 'rgba(0, 0, 0, 0.55)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
