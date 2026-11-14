import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { logScreen } from '@/lib/interactionLog';

/**
 * Logs one screen view per route change. Uses the route pattern
 * ("/recipe/[id]"), not the real path, so no ids or tokens end up in the log.
 * Rendered on its own so navigation re-renders only this component.
 */
export function ScreenViewLogger() {
  const segments = useSegments();
  const route = `/${segments.join('/')}`;
  useEffect(() => {
    logScreen(route);
  }, [route]);
  return null;
}
