import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { OnboardingPager } from '@/components/onboarding/OnboardingPager';
import { Screen } from '@/components/Screen';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import type { AppLanguageCode } from '@/lib/appLanguages';
import { promptRtlReloadIfNeeded } from '@/lib/rtlLayout';

/**
 * First-run preferences, then the account screen. Onboarding stays incomplete
 * until sign-up or sign-in creates a session.
 */
export default function OnboardingScreen() {
  const { language, ready: languageReady } = useLanguagePreference();
  const languageAtStart = useRef<AppLanguageCode | null>(null);

  useEffect(() => {
    if (languageReady && languageAtStart.current === null) {
      languageAtStart.current = language;
    }
  }, [languageReady, language]);

  function continueToAccount() {
    const baseline = languageAtStart.current ?? language;
    promptRtlReloadIfNeeded(baseline, language);
    router.push('/auth?mode=signup&reason=onboarding');
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} dense>
      <View className="flex-1 px-5 pb-2 pt-3">
        <OnboardingPager onAccount={continueToAccount} />
      </View>
    </Screen>
  );
}
