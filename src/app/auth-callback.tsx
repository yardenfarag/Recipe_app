import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { completeOAuthFromCallbackUrl } from '@/lib/supabase/auth';

/** Handles Google OAuth when Android/iOS opens pinch://auth-callback from the browser. */
export default function AuthCallbackScreen() {
  const callbackUrl = Linking.useLinkingURL();
  const { colors } = useThemePreference();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackUrl) return;

    let active = true;
    completeOAuthFromCallbackUrl(callbackUrl)
      .then(() => {
        if (active) router.replace('/');
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Sign-in could not be completed.');
        }
      });

    return () => {
      active = false;
    };
  }, [callbackUrl]);

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 items-center justify-center">
        {!error ? (
          <>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text className="mt-4 text-base" style={{ color: colors.textSecondary }}>
              Finishing sign-in…
            </Text>
          </>
        ) : (
          <>
            <Text className="mb-6 text-center text-base" style={{ color: colors.danger }}>
              {error}
            </Text>
            <Pressable
              className="rounded-full px-6 py-3"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.replace('/auth')}
            >
              <Text className="text-base font-bold text-white">Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
