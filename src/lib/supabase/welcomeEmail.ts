import AsyncStorage from '@react-native-async-storage/async-storage';

import { runSingleFlight } from '@/lib/singleFlight';
import { supabase } from '@/lib/supabase/client';

const flights = new Map<string, Promise<void>>();

export function welcomeEmailStorageKey(userId: string): string {
  return `pinch:welcomeEmail:${userId}`;
}

/** Cache only a finished send. Retries stay uncached so the next open can try again. */
export function welcomeEmailShouldCache(status: unknown): boolean {
  return status === 'sent' || status === 'already_sent';
}

/**
 * Sends the signup welcome email once. Existing accounts are already marked
 * sent on the server, so the first call after this ships just records that.
 */
export function sendWelcomeEmailIfNeeded(userId: string): Promise<void> {
  return runSingleFlight(flights, userId, async () => {
    try {
      const key = welcomeEmailStorageKey(userId);
      if ((await AsyncStorage.getItem(key)) === 'done') return;

      const { data, error } = await supabase.functions.invoke<{ status?: string }>('welcome-email', {
        body: {},
      });
      if (error || !welcomeEmailShouldCache(data?.status)) {
        if (error) console.warn('[welcome-email]', error.message);
        return;
      }
      await AsyncStorage.setItem(key, 'done');
    } catch (error) {
      console.warn('[welcome-email]', error);
    }
  });
}
