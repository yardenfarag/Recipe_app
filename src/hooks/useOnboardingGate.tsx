import { router, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useOnboarding } from '@/hooks/useOnboarding';
import { useWebIntro } from '@/hooks/useWebIntro';
import { isAppHome } from '@/lib/webIntro';

/**
 * Incomplete installs stay on `/onboarding` or the account screen.
 * On native, a finished install leaves `/onboarding`. On web that page stays
 * open so it can be viewed again. The public intro owns `/` until Continue.
 */
export function OnboardingGate() {
  const { ready, completed } = useOnboarding();
  const { ready: introReady, dismissed } = useWebIntro();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    if (Platform.OS === 'web' && !introReady) return;

    const onOnboarding = segments[0] === 'onboarding' || pathname === '/onboarding';
    const onWelcome = pathname === '/welcome';
    const onLegal = pathname === '/legal' || pathname.startsWith('/legal/');
    const onAuth =
      segments[0] === 'auth' ||
      segments[0] === 'auth-callback' ||
      pathname === '/auth' ||
      pathname.startsWith('/auth-callback');
    const introOwnsHome = Platform.OS === 'web' && !dismissed && isAppHome(pathname);

    if (introOwnsHome || onWelcome || onLegal) return;

    if (!completed && !onOnboarding && !onAuth) {
      router.replace('/onboarding');
      return;
    }

    if (completed && onOnboarding && Platform.OS !== 'web') {
      router.replace('/(tabs)');
    }
  }, [ready, completed, introReady, dismissed, pathname, segments]);

  return null;
}
