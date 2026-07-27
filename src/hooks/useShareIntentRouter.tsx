import { router, usePathname } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Watches for an incoming OS share (ADR 010) and routes to the Snap tab,
 * which owns consuming + auto-submitting the shared link. Lives at the
 * root so a share reaches Snap regardless of which screen is on top.
 * A share on first open dismisses onboarding permanently so we never trap
 * the recipe behind the tutorial.
 */
export function ShareIntentRouter() {
  const { hasShareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const { ready, completed, completeOnboarding } = useOnboarding();

  useEffect(() => {
    if (!hasShareIntent || !ready) return;

    let cancelled = false;
    (async () => {
      if (!completed) {
        await completeOnboarding();
      }
      if (!cancelled && pathname !== '/add') {
        router.replace('/add');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, ready, completed, completeOnboarding, pathname]);

  return null;
}
