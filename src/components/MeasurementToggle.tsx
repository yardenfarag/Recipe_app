import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { MeasurementSystem } from '@/lib/convertMeasurement';

const MODES: { id: MeasurementSystem; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'original', label: 'Spoons', icon: 'restaurant-outline' },
  { id: 'metric', label: 'Grams', icon: 'scale-outline' },
];

type MeasurementToggleProps = {
  /** One-line hint under the control (recipe screen). */
  hint?: boolean;
};

/** Cute pill toggle — cups & spoons vs grams & milliliters. */
export function MeasurementToggle({ hint = false }: MeasurementToggleProps) {
  const { system, setSystem } = useMeasurementPreference();
  const { colors } = useThemePreference();

  return (
    <View>
      <View
        className="flex-row rounded-[18px] p-1"
        style={{ backgroundColor: colors.primarySoft }}
      >
        {MODES.map((mode) => {
          const active = system === mode.id;
          return (
            <Pressable
              key={mode.id}
              onPress={() => setSystem(mode.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5"
              style={active ? { backgroundColor: colors.surface } : undefined}
            >
              <Ionicons
                name={mode.icon}
                size={16}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text
                className="text-xs font-semibold"
                style={{ color: active ? colors.primary : colors.textSecondary }}
              >
                {mode.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint && system === 'metric' ? (
        <Text className="mt-2 text-center text-[11px] leading-4" style={{ color: colors.textSecondary }}>
          Liquids in ml · solids in g · cloves & pinches stay cozy
        </Text>
      ) : null}
    </View>
  );
}
