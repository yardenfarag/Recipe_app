import { type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';

import { HAIRLINE, KitIcon, MIN_TOUCH, Radii, usePhotoColors, withAlpha, type IconSource } from './tokens';

export type IconButtonVariant = 'ghost' | 'tile' | 'photo';

export type IconButtonProps = {
  /** An Ionicons name or a drawn icon. Chevrons and arrows are mirrored in Hebrew and Arabic. */
  icon: IconSource;
  /** What the button does, read out: "Share". Required, since there are no words on it. */
  label: string;
  onPress?: () => void;
  /**
   * ghost (the default): muted icon, no fill until pressed, on a page or in a tile. tile: a small tile of its own
   * (surface, hairline border), as in a top bar. photo: a translucent scrim backing, on top of a photo.
   */
  variant?: IconButtonVariant;
  /** Fixed id for the admin Activity log, like 'recipe.share'. */
  trackId: string;
  /** Icon size; the button stays 44 × 44. Default 22. */
  iconSize?: number;
  /** Overrides the icon colour (a filled heart in `colors.danger`). */
  color?: string;
  /** Mirror the icon in Hebrew and Arabic; by default only Ionicons that point a direction are. */
  directional?: boolean;
  disabled?: boolean;
  /** For toggles such as favourite: announced as selected. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A 44 × 44 button with only an icon.
 *
 *   <IconButton icon="share-outline" label={t('recipe.share')} trackId="recipe.share" onPress={share} />
 *   <IconButton variant="photo" icon="chevron-back" label={t('common.back')} trackId="recipe.back" onPress={back} />
 */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'ghost',
  trackId,
  iconSize = 22,
  color,
  directional,
  disabled = false,
  selected,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useThemePreference();
  const photo = usePhotoColors();

  const look: Record<IconButtonVariant, { fg: string; bg?: string; pressedBg: string; border?: string }> = {
    ghost: { fg: colors.textSecondary, pressedBg: colors.backgroundElement },
    tile: { fg: colors.text, bg: colors.surface, pressedBg: colors.backgroundElement, border: colors.border },
    photo: { fg: photo.onScrim, bg: withAlpha(photo.scrim, 0.6), pressedBg: withAlpha(photo.scrim, 0.8) },
  };
  const { fg, bg, pressedBg, border } = look[variant];

  return (
    <Pressable
      trackId={trackId}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        {
          width: MIN_TOUCH,
          height: MIN_TOUCH,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radii.control,
          backgroundColor: pressed ? pressedBg : bg,
          borderWidth: border ? HAIRLINE : 0,
          borderColor: border,
        },
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      <KitIcon icon={icon} color={color ?? fg} size={iconSize} directional={directional} />
    </Pressable>
  );
}
