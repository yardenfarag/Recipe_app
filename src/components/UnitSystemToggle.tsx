import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import type { UnitSystem } from '@shared/lib/unitSystem';

type UnitSystemToggleProps = {
  /** Tap-log id prefix; each choice logs as `<trackId>.<choice>`. */
  trackId?: string;
};

/** Metric (°C, g, cm) or US (°F, oz, in), PIN-53. The kit's segmented control, like the spoons-or-grams toggle. */
export function UnitSystemToggle({ trackId = 'units' }: UnitSystemToggleProps) {
  const { t } = useTranslation();
  const { units, setUnits } = useUnitSystemPreference();

  return (
    <SegmentedControl<UnitSystem>
      label={`${t('measurement.unitsMetric')} / ${t('measurement.unitsUs')}`}
      value={units}
      onChange={setUnits}
      fullWidth
      options={[
        { value: 'metric', label: t('measurement.unitsMetric'), icon: 'thermometer-outline', trackId: `${trackId}.metric` },
        { value: 'us', label: t('measurement.unitsUs'), icon: 'flag-outline', trackId: `${trackId}.us` },
      ]}
    />
  );
}
