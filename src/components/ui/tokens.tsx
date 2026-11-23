/**
 * Shared bits of the Night Market kit (PIN-177): sizes, the colours over a photo, and icons. Colours always come
 * from the theme pack (`useThemePreference().colors`); nothing in the kit uses hex values or NativeWind `pinch-*`
 * colour classes, which only know Mist.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { ThemePacks, type ThemePackId } from '@shared/constants/themes';

/** Corner radii, as on the web (web/app/globals.css). */
export const Radii = {
  /** A page-level tile. */
  tile: 28,
  /** A card in a list. */
  card: 24,
  /** A tile inside a tile. */
  inner: 16,
  /** A fact inside a tile. */
  fact: 14,
  /** Medium buttons, icon buttons, segmented controls, steppers. */
  control: 14,
  pill: 999,
} as const;

/** The hairline border of a tile: 1 pt, the web's 1 px. */
export const HAIRLINE = 1;

/** The smallest touch target. */
export const MIN_TOUCH = 44;

export type PhotoColors = {
  /** Behind and under the words on a photo. */
  scrim: string;
  onScrim: string;
  onScrimMuted: string;
  /** A filled badge or button on a photo. */
  scrimPrimary: string;
  onScrimPrimary: string;
};

/**
 * The colours over a photo: the pack's dark colours in light mode too, since a photo doesn't change with the theme
 * (web/lib/theme.ts, PHOTO_VARIABLES).
 */
export function photoColorsFor(packId: ThemePackId): PhotoColors {
  const dark = ThemePacks[packId].dark;
  return {
    scrim: dark.background,
    onScrim: dark.text,
    onScrimMuted: dark.textSecondary,
    scrimPrimary: dark.primary,
    onScrimPrimary: dark.onPrimary,
  };
}

/** The current pack's colours over a photo. */
export function usePhotoColors(): PhotoColors {
  const { packId } = useThemePreference();
  return photoColorsFor(packId);
}

/** A `#RRGGBB` colour at an opacity, for scrims and fades. Other formats come back unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * An icon for a kit control: an Ionicons name (the app's icon set), or a function that draws one in the colour and
 * size the control gives it, such as `({ color, size }) => <CookieMark color={color} size={size} />`.
 */
export type IconSource = IconName | ((props: { color: string; size: number }) => ReactNode);

/** Ionicons that point along the line (forward/back arrows, chevrons, carets) or lean one way (the cart). */
export function isDirectionalIcon(name: string): boolean {
  return /^(chevron|arrow|caret|return)-(back|forward)|^cart(-outline|-sharp)?$|^arrow-(undo|redo)/.test(name);
}

/**
 * Draws an IconSource, hidden from screen readers (the control around it carries the label). In Hebrew and Arabic
 * it is mirrored when it points a direction: Ionicons are recognised by name (`isDirectionalIcon`); pass
 * `directional` to decide yourself (a drawn icon is never mirrored unless you do).
 */
export function KitIcon({
  icon,
  color,
  size,
  directional,
}: {
  icon: IconSource;
  color: string;
  size: number;
  directional?: boolean;
}) {
  const { rtl } = useRtl();
  const mirror = rtl && (directional ?? (typeof icon === 'string' && isDirectionalIcon(icon)));
  const drawn =
    typeof icon === 'function' ? icon({ color, size }) : <Ionicons name={icon} size={size} color={color} />;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {drawn}
    </View>
  );
}
