import { useTranslation } from 'react-i18next';

import { LanguagePicker } from '@/components/LanguagePicker';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { Text } from '@/components/ui/Text';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen>
      <Text variant="bodySmall" tone="muted" style={{ paddingHorizontal: 4 }}>
        {t('settings.languageHint')}
      </Text>
      <LanguagePicker trackId="settings.language" />
    </SettingsDetailScreen>
  );
}
