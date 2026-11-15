import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { saveAccountLocale } from '@/lib/supabase/auth';

/**
 * Keeps the signed-in account's language (user_metadata.locale) in step with the app's, so
 * welcome, sign-in code and purchase emails arrive in the language the person uses.
 */
export function AccountLocaleSync() {
  const { user } = useAuth();
  const { language, ready } = useLanguagePreference();
  const savedLocale = user?.user_metadata?.locale;

  useEffect(() => {
    if (!ready || !user || savedLocale === language) return;
    // Deferred out of the auth event that set `user` (supabase-js deadlocks on nested calls).
    const timer = setTimeout(() => void saveAccountLocale(user, language), 0);
    return () => clearTimeout(timer);
    // Only re-run when the account, its saved language or the app language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id, savedLocale, language]);

  return null;
}
