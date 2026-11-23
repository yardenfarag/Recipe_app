import { type ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { Text } from './Text';
import { HAIRLINE, KitIcon, MIN_TOUCH, type IconSource } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

// 40, 48 and 56 tall with 12, 14 and 16 corners, as on the web (PIN-160).
const SIZES: Record<ButtonSize, { height: number; radius: number; paddingX: number; gap: number; fontSize: number; icon: number }> = {
  sm: { height: 40, radius: 12, paddingX: 16, gap: 6, fontSize: 14, icon: 16 },
  md: { height: 48, radius: 14, paddingX: 20, gap: 8, fontSize: 15, icon: 18 },
  lg: { height: 56, radius: 16, paddingX: 24, gap: 10, fontSize: 17, icon: 20 },
};

export type ButtonProps = {
  /** The label. A string is set in the variant's type; anything else is drawn as given. */
  children: ReactNode;
  onPress?: () => void;
  /**
   * primary: the screen's main action (Space Grotesk bold on the brand colour). secondary: brand-tinted.
   * outline: hairline border on the surface. ghost: no fill until pressed. danger: deleting things. link: words in
   * the brand colour. Default primary.
   */
  variant?: ButtonVariant;
  /** sm 40, md 48 (the default), lg 56 tall. A link ignores it. */
  size?: ButtonSize;
  /** Shows a spinner in place of the icon and blocks presses; the label stays for screen readers. */
  busy?: boolean;
  disabled?: boolean;
  /** Stretches across its container. Otherwise it is as wide as its label, at the start of the line. */
  fullWidth?: boolean;
  /** Before the label. Icons that point a direction (chevrons, arrows) are mirrored in Hebrew and Arabic. */
  icon?: IconSource;
  /** After the label, such as "chevron-forward". */
  iconEnd?: IconSource;
  /** Fixed id for the admin Activity log, like 'recipe.remix'. Never a title or anything typed. */
  trackId: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A button with words. One primary per screen.
 *
 *   <Button trackId="recipe.start_cooking" size="lg" fullWidth onPress={start}>{t('recipe.startCooking')}</Button>
 *   <Button trackId="recipe.remix" variant="secondary" icon="sparkles-outline" onPress={remix}>{t('recipe.remix')}</Button>
 */
export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  fullWidth = false,
  icon,
  iconEnd,
  trackId,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const link = variant === 'link';
  const s = SIZES[size];

  const look: Record<ButtonVariant, { bg?: string; fg: string; border?: string; pressedBg?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.primarySoft, fg: colors.primaryText },
    outline: { bg: colors.surface, fg: colors.text, border: colors.border, pressedBg: colors.backgroundElement },
    ghost: { fg: colors.text, pressedBg: colors.backgroundElement },
    danger: { bg: colors.danger, fg: colors.surface },
    link: { fg: colors.primaryText },
  };
  const { bg, fg, border, pressedBg } = look[variant];
  const display = variant === 'primary' || variant === 'danger';
  const fontSize = link ? 14 : s.fontSize;
  const inactive = disabled || busy;

  return (
    <Pressable
      trackId={trackId}
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      // A small button is 40 tall; the touch area still reaches 44.
      hitSlop={!link && s.height < MIN_TOUCH ? { top: (MIN_TOUCH - s.height) / 2, bottom: (MIN_TOUCH - s.height) / 2 } : undefined}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          gap: link ? 6 : s.gap,
          minHeight: link ? MIN_TOUCH : s.height,
          paddingHorizontal: link ? 4 : s.paddingX,
          borderRadius: link ? 6 : s.radius,
          backgroundColor: pressed && pressedBg ? pressedBg : bg,
          borderWidth: border ? HAIRLINE : 0,
          borderColor: border,
        },
        pressed && !pressedBg ? { opacity: link ? 0.6 : 0.88 } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <KitIcon icon={icon} color={fg} size={s.icon} />
      ) : null}
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text
          numberOfLines={1}
          color={fg}
          style={{
            ...type.font(display ? 'display' : 'body', display ? 'bold' : 'semibold'),
            fontSize,
            lineHeight: Math.round(fontSize * 1.25),
            letterSpacing: display ? type.tracking(-0.01, fontSize) : 0,
            textDecorationLine: link ? 'underline' : 'none',
          }}
        >
          {children}
        </Text>
      ) : (
        <View>{children}</View>
      )}
      {iconEnd && !busy ? <KitIcon icon={iconEnd} color={fg} size={s.icon} /> : null}
    </Pressable>
  );
}
