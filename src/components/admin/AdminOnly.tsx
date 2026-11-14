import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, loading } = useProfile();
  const { colors } = useThemePreference();
  const { t } = useTranslation();

  if (loading) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="mb-3 text-center text-base font-semibold"
            style={{ color: colors.text }}
            accessibilityRole="header"
          >
            Admin only
          </Text>
          <Pressable trackId="admin_only.go_back"
            onPress={() => router.back()}
            accessibilityRole="button"
            className="rounded-[18px] px-5 py-3"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Text style={{ color: colors.primary }} className="font-semibold">
              Go back
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return children;
}
