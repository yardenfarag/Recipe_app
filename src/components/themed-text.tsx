import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { type FontFace, type FontWeightName } from '@/constants/typography';
import { useTheme } from '@/hooks/use-theme';
import { useTypography } from '@/hooks/useTypography';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

/** The face and weight of each legacy type, in Night Market fonts (PIN-177). */
const TYPE_FONTS: Record<Exclude<NonNullable<ThemedTextProps['type']>, 'code'>, [FontFace, FontWeightName]> = {
  default: ['body', 'medium'],
  title: ['display', 'bold'],
  small: ['body', 'medium'],
  smallBold: ['body', 'bold'],
  subtitle: ['display', 'bold'],
  link: ['body', 'regular'],
  linkPrimary: ['body', 'semibold'],
};

/**
 * Legacy text from the Expo template. New screens use the kit's `<Text variant>` (src/components/ui/Text.tsx); this
 * keeps its API and sets its types in the Night Market fonts (Space Grotesk for title and subtitle, Inter otherwise).
 */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const typography = useTypography();
  const font: TextStyle =
    type === 'code' ? styles.code : typography.font(TYPE_FONTS[type][0], TYPE_FONTS[type][1]);

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'linkPrimary' ? 'primaryText' : 'text')] },
        font,
        type === 'default' && styles.default,
        type === 'title' && [styles.title, { letterSpacing: typography.tracking(-0.015, 48) }],
        type === 'small' && styles.small,
        type === 'smallBold' && styles.small,
        type === 'subtitle' && [styles.subtitle, { letterSpacing: typography.tracking(-0.015, 32) }],
        (type === 'link' || type === 'linkPrimary') && styles.link,
        type === 'code' && styles.codeSize,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 48,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 40,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
  },
  codeSize: {
    fontSize: 12,
  },
});
