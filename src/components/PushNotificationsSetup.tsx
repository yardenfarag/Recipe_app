import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { refreshPushRegistration, usePushNotificationRouting } from '@/lib/pushNotifications';

/**
 * Cooking reminders (supabase/functions/nudges): opens the screen a tapped reminder points at, and re-saves this
 * phone's push token for whoever is signed in when permission was already given. It never asks for permission
 * (src/lib/pushPrompt.ts does, after the first recipe is saved). Renders nothing.
 */
export function PushNotificationsSetup() {
  usePushNotificationRouting();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (userId) void refreshPushRegistration(userId);
  }, [userId]);

  return null;
}
