import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsDetailScreen>
      <Tile padding={20} style={{ gap: 14 }}>
        <TileLabel accessibilityRole="header">{t('settings.lightDark')}</TileLabel>
        <ThemeToggle trackId="settings.theme" />
      </Tile>
      {/* Each pack is a tile of its own, straight on the page, painted in that pack's colours. */}
      <View style={{ gap: 14 }}>
        <Text variant="h2">{t('settings.driftTheme')}</Text>
        <ThemePackPicker />
      </View>
    </SettingsDetailScreen>
  );
}
