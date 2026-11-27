import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { type FontWeightName, type TextVariant } from '@/constants/typography';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { usePhotoColors } from './tokens';

export type TextTone =
  | 'default'
  | 'muted'
  | 'primary'
  | 'accent'
  | 'danger'
  | 'success'
  | 'onPrimary'
  | 'onScrim'
  | 'onScrimMuted';

export type TextProps = RNTextProps & {
  /**
   * h1 (30, the page title), h2 (23), h3 (17, a tile's title): Space Grotesk bold, announced as headings.
   * body (16), bodySmall (15), caption (13): Inter. label: the small caps at the top of a tile (12, semibold,
   * muted). number: a big figure (52, Space Grotesk bold, accent). Default body.
   */
  variant?: TextVariant;
  /** Overrides the variant's weight. */
  weight?: FontWeightName;
  /**
   * The colour role. `primary` and `accent` are the pack's text-safe brand colours (primaryText, accentText);
   * `onScrim` and `onScrimMuted` are for words over a photo. Default: muted for labels, accent for numbers, else
   * the text colour.
   */
  tone?: TextTone;
  /** A colour from the pack when no tone fits (`colors.warning`). Wins over `tone`. */
  color?: string;
  /** Reading-direction alignment: start is right in Hebrew and Arabic. Default start. */
  align?: 'start' | 'center' | 'end';
};

/**
 * Puts a Text's lines on the reading-start (or end) side in the app language, on the phone and on the web. Spread
 * it into a React Native Text that isn't the kit's: `style={[..., textDirectionStyle(rtl)]}`. Not for a TextInput:
 * iOS doesn't mirror its alignment, so it keeps the physical side (`useRtl().textAlign`).
 *
 * On iOS and Android, React Native mirrors a Text's `textAlign: 'left'` and `'right'` when its layout direction is
 * right-to-left (they mean start and end there), and the app pins that direction to the app language at the root
 * (I18nProvider). So 'right' in Hebrew lands on the left of a full-width line. Pinning the text's own `direction`
 * too keeps it right whatever its parents say (and after a language switch, before the native RTL flag catches up
 * on a cold start). The web doesn't mirror, so it gets the physical side.
 */
export function textDirectionStyle(rtl: boolean, align: 'start' | 'center' | 'end' = 'start'): TextStyle {
  const writingDirection = rtl ? 'rtl' : 'ltr';
  if (align === 'center') return { textAlign: 'center', writingDirection };
  if (Platform.OS === 'web') {
    return { textAlign: (align === 'start') !== rtl ? 'left' : 'right', writingDirection };
  }
  return { textAlign: align === 'start' ? 'left' : 'right', writingDirection, direction: writingDirection };
}

/**
 * The kit's Text: Night Market type in the app language (fonts, tracking and capitals per script, see
 * src/constants/typography.ts) in the pack's colours. Use it in place of React Native's Text.
 *
 *   <Text variant="h1">{t('tabs.library')}</Text>
 *   <Text variant="caption" tone="muted">{t('library.cookTonightRule')}</Text>
 */
export function Text({ variant = 'body', weight, tone, color, align = 'start', style, ...rest }: TextProps) {
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const type = useTypography();
  const { rtl } = useRtl();

  const resolvedTone: TextTone = tone ?? (variant === 'label' ? 'muted' : variant === 'number' ? 'accent' : 'default');
  const toneColors: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textSecondary,
    primary: colors.primaryText,
    accent: colors.accentText,
    danger: colors.danger,
    success: colors.success,
    onPrimary: colors.onPrimary,
    onScrim: photo.onScrim,
    onScrimMuted: photo.onScrimMuted,
  };
  const heading = variant === 'h1' || variant === 'h2' || variant === 'h3';

  return (
    <RNText
      accessibilityRole={heading ? 'header' : undefined}
      {...rest}
      style={[
        type.variant(variant, weight),
        { color: color ?? toneColors[resolvedTone] },
        textDirectionStyle(rtl, align),
        variant === 'number' ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
