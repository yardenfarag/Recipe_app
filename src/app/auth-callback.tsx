import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { captureOnboardingCompleted } from '@/lib/analytics';
import { takePendingOAuthReason } from '@/lib/pendingOAuth';
import { completeOAuthFromCallbackUrl } from '@/lib/supabase/auth';

const CALLBACK_WAIT_MS = 4_000;

/** Finishes Google OAuth: native opens pinch://auth-callback, web returns to /app/auth-callback. */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const callbackUrl = Linking.useLinkingURL();
  const { colors } = useThemePreference();
  const { completeOnboarding } = useOnboarding();
  const { language } = useLanguagePreference();
  const [error, setError] = useState<string | null>(null);
  // Read through a ref: re-running the effect would reuse the one-time OAuth code.
  const onboardingRef = useRef({ completeOnboarding, language });
  useEffect(() => {
    onboardingRef.current = { completeOnboarding, language };
  }, [completeOnboarding, language]);

  useEffect(() => {
    let active = true;
    let waitTimer: ReturnType<typeof setTimeout> | undefined;

    async function finishSignIn(url: string) {
      try {
        await completeOAuthFromCallbackUrl(url);
        if (!active) return;
        // Web: same next step the auth screen takes after an in-page sign-in.
        if (takePendingOAuthReason() === 'onboarding') {
          const { completeOnboarding: complete, language: locale } = onboardingRef.current;
          captureOnboardingCompleted({ locale, platform: Platform.OS });
          await complete();
          if (active) router.replace('/add');
          return;
        }
        router.replace('/');
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : t('auth.callbackFailed');
          setError(message);
          announce(message);
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
        setError(t('auth.callbackMissing'));
        announce(t('auth.callbackMissing'));
      })();
    }, CALLBACK_WAIT_MS);

    return () => {
      active = false;
      if (waitTimer) clearTimeout(waitTimer);
    };
  }, [callbackUrl, t]);

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 items-center justify-center">
        {!error ? (
          <>
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
            <Text
              className="mt-4 text-base"
              style={{ color: colors.textSecondary }}
              accessibilityLiveRegion="polite"
            >
              {t('auth.callbackFinishing')}
            </Text>
          </>
        ) : (
          <>
            <Text
              className="mb-6 text-center text-base"
              style={{ color: colors.danger }}
              accessibilityRole="alert"
            >
              {error}
            </Text>
            <Pressable
              className="rounded-full px-6 py-3"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.replace('/auth')}
              accessibilityRole="button"
            >
              <Text className="text-base font-bold" style={{ color: colors.onPrimary }}>
                {t('auth.backToSignIn')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
