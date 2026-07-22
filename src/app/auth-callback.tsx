import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { completeOAuthFromCallbackUrl } from '@/lib/supabase/auth';

const CALLBACK_WAIT_MS = 4_000;

/** Handles Google OAuth when Android/iOS opens pinch://auth-callback from the browser. */
export default function AuthCallbackScreen() {
  const callbackUrl = Linking.useLinkingURL();
  const { colors } = useThemePreference();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;

    async function finishSignIn(url: string) {
      try {
        await completeOAuthFromCallbackUrl(url);
        if (active) router.replace('/');
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Sign-in could not be completed.');
        }
      }
    }

    if (callbackUrl) {
      void finishSignIn(callbackUrl);
      return () => {
        active = false;
      };
    }

    waitTimer = setTimeout(() => {
      if (!active) return;
      void (async () => {
        const initial = await Linking.getInitialURL();
        if (!active) return;
        if (initial) {
          await finishSignIn(initial);
          return;
        }
        setError('Sign-in link was missing. Try again from the sign-in screen.');
      })();
    }, CALLBACK_WAIT_MS);

    return () => {
      active = false;
      if (waitTimer) clearTimeout(waitTimer);
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
