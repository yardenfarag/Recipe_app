import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { Text } from './Text';
import { KitIcon, MIN_TOUCH, Radii, type IconSource } from './tokens';

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: IconSource;
  /** Icon only; the label is still read out. */
  iconOnly?: boolean;
  /** Fixed id for the admin Activity log, like 'recipe.measure.grams'. */
  trackId: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What is being chosen, read out: "Measurements". */
  label: string;
  /** radio (the default): a choice. tabs: each choice shows a different panel. */
  kind?: 'radio' | 'tabs';
  /** Spreads the choices across the width, each the same size. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Two or three choices side by side where exactly one is on: Spoons/Grams, grid/list, Ingredients/Steps. An
 * element-coloured track with the chosen one on a surface-coloured thumb. Follows the reading direction.
 *
 *   <SegmentedControl
 *     label={t('measurement.unitsTitle')}
 *     value={system}
 *     onChange={setSystem}
 *     options={[
 *       { value: 'spoons', label: t('measurement.spoons'), trackId: 'recipe.measure.spoons' },
 *       { value: 'grams', label: t('measurement.grams'), trackId: 'recipe.measure.grams' },
 *     ]}
 *   />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = 'radio',
  fullWidth = false,
  style,
}: SegmentedControlProps<T>) {
  const { colors } = useThemePreference();
  const type = useTypography();

  return (
    <View
      accessibilityRole={kind === 'tabs' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          gap: 4,
          padding: 4,
          borderRadius: Radii.control,
          backgroundColor: colors.backgroundElement,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const on = option.value === value;
        const fg = on ? colors.text : colors.textSecondary;
        return (
          <Pressable
            key={option.value}
            trackId={option.trackId}
            onPress={() => onChange(option.value)}
            accessibilityRole={kind === 'tabs' ? 'tab' : 'radio'}
            accessibilityLabel={option.label}
            accessibilityState={kind === 'tabs' ? { selected: on } : { checked: on }}
            style={{
              flex: fullWidth ? 1 : undefined,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              // The track adds 4 on each side, so the control is 44 + 8 tall and each choice 44.
              height: MIN_TOUCH,
              minWidth: MIN_TOUCH,
              paddingHorizontal: option.iconOnly ? 0 : 14,
              borderRadius: 10,
              backgroundColor: on ? colors.surface : 'transparent',
            }}
          >
            {option.icon ? <KitIcon icon={option.icon} color={fg} size={18} /> : null}
            {option.iconOnly ? null : (
              <Text
                numberOfLines={1}
                color={fg}
                style={{ ...type.font('body', 'semibold'), fontSize: 14, lineHeight: 18 }}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
