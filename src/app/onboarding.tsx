import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { OnboardingPager } from '@/components/onboarding/OnboardingPager';
import { Screen } from '@/components/Screen';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useOnboarding } from '@/hooks/useOnboarding';
import type { AppLanguageCode } from '@/lib/appLanguages';
import { promptRtlReloadIfNeeded } from '@/lib/rtlLayout';

/**
 * One-time first-open onboarding. Completing or skipping sets a persistent
 * install flag; RTL reload (if language crossed LTR/RTL) is deferred until exit.
 */
export default function OnboardingScreen() {
  const { language, ready: languageReady } = useLanguagePreference();
  const { completeOnboarding } = useOnboarding();
  const languageAtStart = useRef<AppLanguageCode | null>(null);

  useEffect(() => {
    if (languageReady && languageAtStart.current === null) {
      languageAtStart.current = language;
    }
  }, [languageReady, language]);

  async function finish(destination: 'snap' | 'library') {
    const baseline = languageAtStart.current ?? language;
    await completeOnboarding();
    promptRtlReloadIfNeeded(baseline, language);
    router.replace(destination === 'snap' ? '/add' : '/(tabs)');
  }

  async function skip() {
    await finish('snap');
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} dense>
      <View className="flex-1 px-5 pb-2 pt-3">
        <OnboardingPager onFinish={finish} onSkip={skip} />
      </View>
    </Screen>
  );
}
