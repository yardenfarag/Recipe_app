import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, loading } = useProfile();
  const { colors } = useThemePreference();

  if (loading) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!user || !isAdmin) {
    return (
      <Screen dense>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-base font-semibold" style={{ color: colors.text }}>
            Admin only
          </Text>
          <Pressable
            onPress={() => router.back()}
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
