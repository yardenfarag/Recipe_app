import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useThemePreference } from '@/hooks/useThemePreference';

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();

  return (
    <SettingsDetailScreen>
      <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.lightDark')}
      </Text>
      <ThemeToggle />
      <Text className="mb-4 mt-6 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.driftTheme')}
      </Text>
      <ThemePackPicker />
    </SettingsDetailScreen>
  );
}
