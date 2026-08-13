import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { FormContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';

type SettingsDetailScreenProps = {
  children: ReactNode;
};

/** Shared, responsive shell for focused settings category screens. */
export function SettingsDetailScreen({ children }: SettingsDetailScreenProps) {
  const { isMediumUp } = useBreakpoint();
  const { colors } = useThemePreference();

  return (
    <Screen dense>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="px-5 pt-5"
          style={
            isMediumUp
              ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
        >
          <View
            className="rounded-[24px] border p-5"
            style={{ backgroundColor: colors.frosted, borderColor: colors.frostedBorder }}
          >
            {children}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
