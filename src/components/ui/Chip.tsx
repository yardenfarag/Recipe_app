import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { Text } from './Text';
import { HAIRLINE, KitIcon, MIN_TOUCH, Radii, type IconSource } from './tokens';

export type ChipProps = {
  children: ReactNode;
  onPress?: () => void;
  /**
   * Whether the filter is on: filled with the text colour, words in the background colour, so it stands out in
   * every pack. Leave it out for a chip that only does something (opens a sheet).
   */
  selected?: boolean;
  /** md (the default, 14 px words) or sm (13 px, tighter). Both are 44 tall. */
  size?: 'sm' | 'md';
  /** toggle (the default) is announced as on or off; radio as one of a set where exactly one is chosen. */
  kind?: 'toggle' | 'radio';
  /** Before the words. */
  icon?: IconSource;
  /** Fixed id for the admin Activity log, like 'library.filter.quick'. */
  trackId: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A pill filter chip, 44 tall. Sits in a horizontal ScrollView row of chips.
 *
 *   <Chip selected={filter === 'all'} trackId="library.filter.all" onPress={() => setFilter('all')}>
 *     {t('web.library.filterAll')}
 *   </Chip>
 */
export function Chip({
  children,
  onPress,
  selected,
  size = 'md',
  kind = 'toggle',
  icon,
  trackId,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const fg = selected ? colors.background : colors.text;
  const fontSize = size === 'sm' ? 13 : 14;

  return (
    <Pressable
      trackId={trackId}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind === 'radio' ? 'radio' : 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        selected === undefined
          ? { disabled }
          : kind === 'radio'
            ? { disabled, checked: selected }
            : { disabled, selected }
      }
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 8,
          height: MIN_TOUCH,
          paddingHorizontal: size === 'sm' ? 14 : 16,
          borderRadius: Radii.pill,
          borderWidth: HAIRLINE,
          borderColor: selected ? colors.text : colors.border,
          backgroundColor: selected ? colors.text : pressed ? colors.backgroundElement : 'transparent',
        },
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {icon ? <KitIcon icon={icon} color={fg} size={16} /> : null}
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text
          numberOfLines={1}
          color={fg}
          style={{ ...type.font('body', 'semibold'), fontSize, lineHeight: Math.round(fontSize * 1.3) }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
