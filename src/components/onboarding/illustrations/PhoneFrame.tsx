import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';

type PhoneFrameProps = {
  children: ReactNode;
};

/** Soft phone silhouette used by onboarding vignettes. */
export function PhoneFrame({ children }: PhoneFrameProps) {
  const { colors } = useThemePreference();

  return (
    <View
      style={{
        height: 220,
        width: 156,
        overflow: 'hidden',
        borderRadius: 36,
        borderWidth: 2,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingBottom: 14,
        paddingTop: 16,
      }}
    >
      <View
        style={{
          width: 40,
          height: 5,
          borderRadius: 999,
          backgroundColor: colors.border,
          alignSelf: 'center',
          marginBottom: 12,
        }}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
