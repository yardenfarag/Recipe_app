import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { MeasurementToggle } from '@/components/MeasurementToggle';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { useThemePreference } from '@/hooks/useThemePreference';

export default function RecipeSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();

  return (
    <SettingsDetailScreen>
      <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.measurements')}
      </Text>
      <MeasurementToggle />
      <Text className="mt-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.measurementsHint')}
      </Text>
    </SettingsDetailScreen>
  );
}
