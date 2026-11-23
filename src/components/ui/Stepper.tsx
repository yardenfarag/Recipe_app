import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

import { Text } from './Text';
import { KitIcon, MIN_TOUCH, Radii } from './tokens';

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** What the number is, read out: "Servings". */
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** What to show between the buttons. Defaults to the number. */
  children?: ReactNode;
  /** What a screen reader hears as the value: "4 servings". Defaults to the number. */
  spokenValue?: string;
  /** Activity-log id prefix: the buttons log `<trackId>.decrease` and `<trackId>.increase`. */
  trackId: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A number with − and + beside it, such as servings, on an element-coloured track. Screen readers get it as one
 * adjustable control (swipe up or down to change it). At either end the button greys out.
 *
 *   <Stepper label={t('recipe.servings')} value={servings} onChange={setServings} min={1}
 *     decreaseLabel={t('a11y.decreaseServings')} increaseLabel={t('a11y.increaseServings')} trackId="recipe.servings" />
 */
export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  label,
  decreaseLabel,
  increaseLabel,
  children,
  spokenValue,
  trackId,
  style,
}: StepperProps) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const atMin = value <= min;
  const atMax = value >= max;

  const stepButton = (direction: 'decrease' | 'increase') => {
    const off = direction === 'decrease' ? atMin : atMax;
    return (
      <Pressable
        trackId={`${trackId}.${direction}`}
        onPress={() => {
          if (!off) onChange(direction === 'decrease' ? value - 1 : value + 1);
        }}
        disabled={off}
        // The group is the accessible control; these two are reached through its adjust actions.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityLabel={direction === 'decrease' ? decreaseLabel : increaseLabel}
        style={({ pressed }) => ({
          width: MIN_TOUCH,
          height: MIN_TOUCH,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 10,
          backgroundColor: pressed ? colors.surface : 'transparent',
          opacity: off ? 0.4 : 1,
        })}
      >
        <KitIcon icon={direction === 'decrease' ? 'remove' : 'add'} color={colors.text} size={18} />
      </Pressable>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: spokenValue ?? String(value) }}
      accessibilityActions={[
        { name: 'increment', label: increaseLabel },
        { name: 'decrement', label: decreaseLabel },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && !atMax) onChange(value + 1);
        if (event.nativeEvent.actionName === 'decrement' && !atMin) onChange(value - 1);
      }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 4,
          padding: 4,
          borderRadius: Radii.control,
          backgroundColor: colors.backgroundElement,
        },
        style,
      ]}
    >
      {stepButton('decrease')}
      <View style={{ minWidth: 32, paddingHorizontal: 4, alignItems: 'center' }}>
        {children ?? (
          <Text
            align="center"
            style={{ ...type.font('body', 'bold'), fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] }}
          >
            {value}
          </Text>
        )}
      </View>
      {stepButton('increase')}
    </View>
  );
}
