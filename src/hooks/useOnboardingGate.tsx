import { router, usePathname, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useOnboarding } from '@/hooks/useOnboarding';
import { useWebIntro } from '@/hooks/useWebIntro';
import { isAppHome } from '@/lib/webIntro';

/**
 * Keeps first-run onboarding as a one-time gate: incomplete installs stay on
 * `/onboarding` or the account screen; completed installs never return there.
 * On web, the public intro owns `/` until the visitor continues.
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
    const introOwnsHome =
      Platform.OS === 'web' && !dismissed && !completed && isAppHome(pathname);

    if (introOwnsHome || onWelcome || onLegal) return;

    if (!completed && !onOnboarding && !onAuth) {
      router.replace('/onboarding');
      return;
    }

    if (completed && onOnboarding) {
      router.replace('/(tabs)');
    }
  }, [ready, completed, introReady, dismissed, pathname, segments]);

  return null;
}
