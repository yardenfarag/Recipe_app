import { useTranslation } from 'react-i18next';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import type { MeasurementSystem } from '@shared/lib/convertMeasurement';

type MeasurementToggleProps = {
  /** One-line hint under the control (recipe screen). */
  hint?: boolean;
  /** Tap-log id prefix; each mode logs as `<trackId>.<mode>`. */
  trackId?: string;
  /** Words only and as wide as they are, to sit beside the servings on the recipe page. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Cups & spoons or grams & milliliters, on the kit's segmented control (PIN-177). */
export function MeasurementToggle({ hint = false, trackId = 'measurement', compact = false, style }: MeasurementToggleProps) {
  const { t } = useTranslation();
  const { system, setSystem } = useMeasurementPreference();

  return (
    <View style={style}>
      <SegmentedControl<MeasurementSystem>
        label={`${t('measurement.spoons')} / ${t('measurement.grams')}`}
        value={system}
        onChange={setSystem}
        fullWidth={!compact}
        options={[
          {
            value: 'original',
            label: t('measurement.spoons'),
            icon: compact ? undefined : 'restaurant-outline',
            trackId: `${trackId}.original`,
          },
          {
            value: 'metric',
            label: t('measurement.grams'),
            icon: compact ? undefined : 'scale-outline',
            trackId: `${trackId}.metric`,
          },
        ]}
      />
      {hint && system === 'metric' ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
          {t('measurement.metricHint')}
        </Text>
      ) : null}
    </View>
  );
}
