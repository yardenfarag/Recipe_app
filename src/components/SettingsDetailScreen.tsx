import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { FormContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';

type SettingsDetailScreenProps = {
  /** The page's tiles (SettingsGroup, SettingsSection, Tile), stacked 20 apart. */
  children: ReactNode;
};

/**
 * The page under a settings row (Night Market, PIN-177): a flat scrolling page of tiles below the stack header,
 * which already carries the page's title.
 */
export function SettingsDetailScreen({ children }: SettingsDetailScreenProps) {
  const { isMediumUp } = useBreakpoint();

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            { paddingHorizontal: 20, paddingTop: 12, gap: 20 },
            isMediumUp ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' } : null,
          ]}
        >
          {children}
        </View>
      </ScrollView>
    </Screen>
  );
}
