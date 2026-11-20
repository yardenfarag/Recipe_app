"use client";

import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { saveAccountLocale } from "@shared/lib/supabase/auth";

import { useAuth } from "@/components/AuthProvider";
import i18n, { changeLanguage, pickLanguage, textDirection } from "@/lib/i18n";

/**
 * The app language follows the account's saved language (user_metadata.locale), as on mobile. Signed out, or
 * before an account has one, it follows the browser. An account without a saved language gets this one, so
 * emails (welcome, codes, receipts) go out in it. Choosing a language by hand comes with Settings (PIN-139).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const accountLocale = user?.user_metadata?.locale;

  useEffect(() => {
    if (loading) return;
    const language = pickLanguage(accountLocale, navigator.language);
    document.documentElement.lang = language;
    document.documentElement.dir = textDirection(language);
    void changeLanguage(language).catch((error) => console.warn("[i18n] language load failed", error));

    if (user && typeof accountLocale !== "string") {
      // Deferred out of the auth event that set `user` (supabase-js deadlocks on nested calls).
      const timer = setTimeout(() => void saveAccountLocale(user, language), 0);
      return () => clearTimeout(timer);
    }
    // Only the account, its saved language and the loading state matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, accountLocale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
