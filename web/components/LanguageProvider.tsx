"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { isAppLanguageCode, type AppLanguageCode } from "@shared/lib/appLanguages";
import { saveAccountLocale } from "@shared/lib/supabase/auth";

import { useAuth } from "@/components/AuthProvider";
import i18n, { changeLanguage, pickLanguage, textDirection } from "@/lib/i18n";
import { LANGUAGE_STORAGE_KEY } from "@/lib/theme";

interface LanguageState {
  language: AppLanguageCode;
  setLanguage: (next: AppLanguageCode) => void;
}

const LanguageContext = createContext<LanguageState | null>(null);

function readSavedLanguage(): AppLanguageCode | null {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved && isAppLanguageCode(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Which language the app speaks, in this order: one picked in this browser (stored under the same key as the
 * Expo web app), the account's saved language, the browser's. The account always gets the language in use, so
 * its emails (welcome, codes, receipts) match.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const accountLocale = user?.user_metadata?.locale;
  const [picked, setPicked] = useState<AppLanguageCode | null>(null);
  const [language, setLanguageState] = useState<AppLanguageCode>("en");

  useEffect(() => {
    // The saved pick only exists in the browser, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(readSavedLanguage());
  }, []);

  useEffect(() => {
    if (loading) return;
    const next = picked ?? pickLanguage(accountLocale, navigator.language);
    const root = document.documentElement;
    root.lang = next;
    root.dir = textDirection(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguageState(next);
    void changeLanguage(next).catch((error) => console.warn("[i18n] language load failed", error));

    if (user && accountLocale !== next) {
      // Deferred out of the auth event that set `user` (supabase-js deadlocks on nested calls).
      const timer = setTimeout(() => void saveAccountLocale(user, next), 0);
      return () => clearTimeout(timer);
    }
    // Only the account, its saved language, the pick and the loading state matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, accountLocale, picked]);

  const setLanguage = useCallback((next: AppLanguageCode) => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the account still remembers it.
    }
    setPicked(next);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageState {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return value;
}
