import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';

import { useThemePreference } from '@/hooks/useThemePreference';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import { CHROME_MAX_FONT_SCALE } from '@/lib/a11y';
import type { UnitSystem } from '@shared/lib/unitSystem';

const MODES: { id: UnitSystem; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'metric', icon: 'thermometer-outline' },
  { id: 'us', icon: 'flag-outline' },
];

type UnitSystemToggleProps = {
  /** Tap-log id prefix; each choice logs as `<trackId>.<choice>`. */
  trackId?: string;
};

/** Metric (°C, g, cm) or US (°F, oz, in), PIN-53. Same pill as the spoons-or-grams toggle. */
export function UnitSystemToggle({ trackId = 'units' }: UnitSystemToggleProps) {
  const { t } = useTranslation();
  const { units, setUnits } = useUnitSystemPreference();
  const { colors } = useThemePreference();

  const labels: Record<UnitSystem, string> = {
    metric: t('measurement.unitsMetric'),
    us: t('measurement.unitsUs'),
  };

  return (
    <View className="flex-row rounded-[18px] p-1" style={{ backgroundColor: colors.primarySoft }}>
      {MODES.map((mode) => {
        const active = units === mode.id;
        return (
          <Pressable
            trackId={`${trackId}.${mode.id}`}
            key={mode.id}
            onPress={() => setUnits(mode.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={mode.id === 'metric' ? t('a11y.unitsMetric') : t('a11y.unitsUs')}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] px-3 py-2.5"
            style={active ? { backgroundColor: colors.surface } : undefined}
          >
            <Ionicons name={mode.icon} size={16} color={active ? colors.primary : colors.textSecondary} />
            <Text
              className="text-xs font-semibold"
              style={{ color: active ? colors.primary : colors.textSecondary }}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
              numberOfLines={1}
            >
              {labels[mode.id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
