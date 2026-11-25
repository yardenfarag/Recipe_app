"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchMessagePreferences, saveMessagePreference, type MessagePreferences } from "@shared/lib/supabase/emailPreferences";
import { showToast } from "@shared/lib/toast";

import { useAuth } from "@/components/AuthProvider";
import { SettingsCard, SwitchRow } from "@/components/settings/controls";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";

/**
 * Tips and reminders by email, on or off (PIN-189). The same switch as the mobile app's and the unsubscribe link in
 * every such email, so turning it off there shows here. Reminder pushes have their own switch on the phone.
 */
export function EmailSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  // `prefs` is null when they couldn't be read.
  const [loaded, setLoaded] = useState<{ userId: string; prefs: MessagePreferences | null } | null>(null);

  const read = useCallback(async (id: string) => {
    try {
      return { userId: id, prefs: await fetchMessagePreferences(id) };
    } catch {
      return { userId: id, prefs: null };
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void read(userId).then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, read]);

  function retry() {
    if (!userId) return;
    setLoaded(null);
    void read(userId).then(setLoaded);
  }

  async function setEmails(on: boolean) {
    const before = loaded?.prefs;
    if (!userId || !before) return;
    setLoaded({ userId, prefs: { ...before, emailOptOut: !on } });
    try {
      await saveMessagePreference(userId, "emailOptOut", !on);
    } catch {
      setLoaded({ userId, prefs: before });
      showToast(t("messages.saveFailed"), "error");
    }
  }

  // Never show another account's switches after switching.
  const current = loaded && loaded.userId === userId ? loaded : null;
  const prefs = current?.prefs ?? null;
  const failed = current !== null && current.prefs === null;

  return (
    <>
      <SettingsPageHeader id="emails" />
      {prefs ? (
        <SettingsCard title={t("messages.emailGroup")}>
          <SwitchRow
            label={t("messages.emailLabel")}
            hint={t("messages.emailHint")}
            checked={!prefs.emailOptOut}
            onChange={(next) => void setEmails(next)}
            trackId="settings.emails.tips.toggle"
          />
        </SettingsCard>
      ) : failed ? (
        <ErrorState body={t("messages.loadFailed")} onRetry={retry} trackId="settings.emails" />
      ) : (
        <LoadingState />
      )}
    </>
  );
}
