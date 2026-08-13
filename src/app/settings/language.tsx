import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { useThemePreference } from '@/hooks/useThemePreference';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();

  return (
    <SettingsDetailScreen>
      <LanguagePicker />
      <Text className="mt-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.languageHint')}
      </Text>
    </SettingsDetailScreen>
  );
}
