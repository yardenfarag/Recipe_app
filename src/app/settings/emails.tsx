import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { SettingsSwitchRow } from '@/components/SettingsSwitchRow';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { useAuth } from '@/hooks/useAuth';
import { announce } from '@/lib/a11y';
import { getPushPermissionState, registerForPushNotifications } from '@/lib/pushNotifications';
import {
  fetchMessagePreferences,
  saveMessagePreference,
  type MessagePreferences,
} from '@shared/lib/supabase/emailPreferences';
import { showToast } from '@shared/lib/toast';

/**
 * Emails & notifications (PIN-189): tips and reminders by email, and reminder pushes, each with its own switch.
 * The email switch is the one the unsubscribe link in those emails turns off, and the web's Settings → Emails.
 * Turning reminders back on here also asks the phone for permission when it never was.
 */
export default function EmailSettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id;
  const [prefs, setPrefs] = useState<MessagePreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [pushBlocked, setPushBlocked] = useState(false);
  const hasPush = Platform.OS === 'ios' || Platform.OS === 'android';

  const load = useCallback(async (id: string) => {
    setFailed(false);
    try {
      setPrefs(await fetchMessagePreferences(id));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (userId) void load(userId);
  }, [userId, load]);

  useEffect(() => {
    if (!hasPush) return;
    void getPushPermissionState().then((state) => setPushBlocked(state === 'blocked'));
  }, [hasPush]);

  async function toggle(key: keyof MessagePreferences) {
    if (!userId || !prefs) return;
    const before = prefs;
    const optOut = !before[key];
    setPrefs({ ...before, [key]: optOut });
    try {
      await saveMessagePreference(userId, key, optOut);
    } catch {
      setPrefs(before);
      showToast(t('messages.saveFailed'), 'error');
      announce(t('messages.saveFailed'), { liveRegion: true });
      return;
    }
    if (key === 'pushOptOut' && !optOut) {
      const result = await registerForPushNotifications(userId);
      setPushBlocked(result === 'denied' && (await getPushPermissionState()) === 'blocked');
    }
  }

  return (
    <SettingsDetailScreen>
      <Text variant="bodySmall" tone="muted" style={{ paddingHorizontal: 4 }}>
        {t('messages.hint')}
      </Text>
      {prefs ? (
        <>
          <Tile padding={20} style={{ gap: 12 }}>
            <Text variant="h3" accessibilityRole="header">
              {t('messages.emailGroup')}
            </Text>
            <SettingsSwitchRow
              trackId="settings.emails.tips.toggle"
              label={t('messages.emailLabel')}
              hint={t('messages.emailHint')}
              value={!prefs.emailOptOut}
              onToggle={() => void toggle('emailOptOut')}
            />
          </Tile>
          {hasPush ? (
            <Tile padding={20} style={{ gap: 12 }}>
              <Text variant="h3" accessibilityRole="header">
                {t('messages.pushGroup')}
              </Text>
              <SettingsSwitchRow
                trackId="settings.emails.push.toggle"
                label={t('messages.pushLabel')}
                hint={t('messages.pushHint')}
                value={!prefs.pushOptOut}
                onToggle={() => void toggle('pushOptOut')}
              />
              {!prefs.pushOptOut && pushBlocked ? (
                <Text variant="caption" tone="muted">
                  {t('push.blocked')}
                </Text>
              ) : null}
            </Tile>
          ) : null}
        </>
      ) : failed ? (
        <View style={{ gap: 12 }}>
          <Text variant="bodySmall" tone="danger">
            {t('messages.loadFailed')}
          </Text>
          <Button trackId="settings.emails.retry" variant="secondary" onPress={() => userId && void load(userId)}>
            {t('common.tryAgainAction')}
          </Button>
        </View>
      ) : (
        <ActivityIndicator accessibilityLabel={t('messages.title')} style={{ paddingVertical: 24 }} />
      )}
    </SettingsDetailScreen>
  );
}
