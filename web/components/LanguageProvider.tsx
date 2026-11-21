"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { isAppLanguageCode, type AppLanguageCode } from "@shared/lib/appLanguages";

import { useAuth } from "@/components/AuthProvider";
import { accountPreferences, useAccountPreferences } from "@/lib/accountPreferences";
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

function writeSavedLanguage(language: AppLanguageCode) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage blocked: the account still remembers it.
  }
}

/**
 * Which language the app speaks, in this order: the signed-in account's (`user_metadata.locale`, which the mobile
 * app reads and writes too), one picked in this browser (stored under the same key as the Expo web app), the
 * browser's. The account's language becomes this browser's pick, so the head script paints it next time and it
 * stays after signing out. An account without a language gets the one in use, so its emails (welcome, codes,
 * receipts) match (PIN-154).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const sessionLocale = user?.user_metadata?.locale;
  const accountLanguage = useAccountPreferences().prefs.language;
  const [picked, setPicked] = useState<AppLanguageCode | null>(null);
  const [language, setLanguageState] = useState<AppLanguageCode>("en");

  useEffect(() => {
    // The saved pick only exists in the browser, so it is read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(readSavedLanguage());
  }, []);

  // The account's language becomes this browser's pick. Declared after the read above, so it wins on the first render.
  useEffect(() => {
    if (!accountLanguage) return;
    writeSavedLanguage(accountLanguage);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(accountLanguage);
  }, [accountLanguage]);

  useEffect(() => {
    if (loading) return;
    const next = accountLanguage ?? picked ?? pickLanguage(sessionLocale, navigator.language);
    const root = document.documentElement;
    root.lang = next;
    root.dir = textDirection(next);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguageState(next);
    void changeLanguage(next).catch((error) => console.warn("[i18n] language load failed", error));
    // Fills an account that has no language yet (saved once it has been read from the server).
    if (!accountLanguage) accountPreferences().reportDevice({ language: next });
  }, [loading, accountLanguage, picked, sessionLocale]);

  const setLanguage = useCallback((next: AppLanguageCode) => {
    writeSavedLanguage(next);
    setPicked(next);
    accountPreferences().save({ language: next });
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
