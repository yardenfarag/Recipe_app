import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { CookieMark } from '@/components/CookieMark';
import { LanguagePicker } from '@/components/LanguagePicker';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { Screen } from '@/components/Screen';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTranslation } from 'react-i18next';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';
import { confirmAction, confirmDestructive } from '@/lib/confirmAction';
import {
  FREE_EXTRACT_LIMIT,
  PLUS_MONTHLY_EXTRACT_LIMIT,
  PLUS_PRICE_DISPLAY,
} from '@/lib/quotas';
import {
  deleteAccount,
  requestAppleAuthorizationCodeForDeletion,
  signOut,
  userHasAppleIdentity,
} from '@/lib/supabase/auth';
import { uploadAvatar } from '@/lib/supabase/profile';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, migrationError, retryMigration } = useAuth();
  const {
    avatarUrl,
    subscriptionActive,
    extractsRemaining,
    isAdmin,
    refresh,
    upgradeToPlus,
    cancelPlus,
  } = useProfile();
  const { colors } = useThemePreference();
  const [uploading, setUploading] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  async function handleUpgrade() {
    if (!user || planBusy) return;
    const ok = await confirmAction(
      t('settings.upgradeConfirmTitle'),
      t('settings.billingNote'),
      t('common.upgrade'),
    );
    if (!ok) return;
    setPlanBusy(true);
    try {
      await upgradeToPlus();
      Alert.alert(
        t('settings.upgradeSuccessTitle'),
        t('settings.upgradeSuccessBody', { limit: PLUS_MONTHLY_EXTRACT_LIMIT }),
      );
    } catch (err) {
      Alert.alert(
        t('settings.upgradeFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleCancelPlus() {
    if (!user || planBusy) return;
    const ok = await confirmDestructive(
      t('settings.cancelConfirmTitle'),
      t('settings.cancelConfirmBody'),
      t('settings.cancelConfirmAction'),
    );
    if (!ok) return;
    setPlanBusy(true);
    try {
      await cancelPlus();
      Alert.alert(t('settings.cancelSuccessTitle'), t('settings.cancelSuccessBody'));
    } catch (err) {
      Alert.alert(
        t('settings.cancelFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      Alert.alert(
        t('settings.signOutFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  }

  function handleDeleteAccount() {
    if (!user || deleting) return;

    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.continue'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('settings.deleteConfirmFinalTitle'), t('settings.deleteConfirmFinalBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('settings.deleteAccount'),
              style: 'destructive',
              onPress: () => void confirmDeleteAccount(),
            },
          ]);
        },
      },
    ]);
  }

  async function confirmDeleteAccount() {
    if (!user || deleting) return;
    setDeleting(true);
    try {
      let appleAuthorizationCode: string | null = null;
      if (userHasAppleIdentity(user)) {
        try {
          appleAuthorizationCode = await requestAppleAuthorizationCodeForDeletion();
        } catch {
          // TN3194: still fulfill deletion if Apple re-auth is cancelled/unavailable.
        }
      }

      await deleteAccount({ appleAuthorizationCode });
      router.replace('/');
      Alert.alert(t('settings.deleteSuccessTitle'), t('settings.deleteSuccessBody'));
    } catch (err) {
      Alert.alert(
        t('settings.deleteFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleChangeAvatar() {
    if (!user) {
      Alert.alert(t('settings.signInRequiredTitle'), t('settings.signInRequiredBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.signIn'), onPress: () => router.push('/auth?mode=signin&reason=sync') },
      ]);
      return;
    }

    Alert.alert(t('settings.changeAvatarTitle'), undefined, [
      { text: t('settings.takePhoto'), onPress: () => pickImage('camera') },
      { text: t('settings.chooseLibrary'), onPress: () => pickImage('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function pickImage(source: 'camera' | 'library') {
    if (!user) return;

    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          t('settings.permissionNeededTitle'),
          source === 'camera' ? t('settings.permissionCamera') : t('settings.permissionLibrary'),
        );
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert(t('settings.imageReadFailedTitle'), t('settings.imageReadFailedBody'));
        return;
      }

      setUploading(true);
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      await uploadAvatar(user.id, asset.base64, fileExt);
      await refresh();
    } catch (err) {
      Alert.alert(
        t('settings.uploadFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setUploading(false);
    }
  }

  const planLabel = subscriptionActive ? t('settings.planPlus') : t('settings.planFree');
  const planDetail = subscriptionActive
    ? extractsRemaining != null
      ? t('settings.planDetailPlusRemaining', {
          remaining: extractsRemaining,
          limit: PLUS_MONTHLY_EXTRACT_LIMIT,
        })
      : t('settings.planDetailPlus', { limit: PLUS_MONTHLY_EXTRACT_LIMIT })
    : extractsRemaining != null
      ? t('settings.planDetailFreeRemaining', {
          remaining: extractsRemaining,
          limit: FREE_EXTRACT_LIMIT,
        })
      : t('settings.planDetailFree', { limit: FREE_EXTRACT_LIMIT });

  return (
    <Screen dense tabScreen>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-1">
          <BrandHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

          <View
            className="mb-5 mt-6 items-center rounded-[28px] p-6"
            style={{
              backgroundColor: colors.frosted,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
            }}
          >
            <Pressable onPress={handleChangeAvatar} disabled={uploading} className="relative mb-3">
              <View
                className="h-24 w-24 items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: colors.primarySoft }}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{ width: 96, height: 96, backgroundColor: colors.primarySoft }}
                    contentFit="cover"
                    contentPosition="center"
                    transition={200}
                  />
                ) : (
                  <Ionicons name="person" size={40} color={colors.primary} />
                )}
              </View>
              <View
                className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2"
                style={{
                  backgroundColor: colors.primary,
                  borderColor: colors.surface,
                }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </Pressable>

            <Text className="mb-1 text-base font-semibold" style={{ color: colors.text }}>
              {user?.email ?? t('settings.guest')}
            </Text>
            <Text className="mb-4 text-center text-xs" style={{ color: colors.textSecondary }}>
              {user
                ? t('settings.signedIn', { plan: planLabel })
                : t('settings.signInToSync')}
            </Text>

            <Pressable
              onPress={() =>
                user ? handleSignOut() : router.push('/auth?mode=signin&reason=sync')
              }
              className="h-10 items-center justify-center rounded-[18px] px-5 active:opacity-70"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {user ? t('settings.signOut') : t('settings.signIn')}
              </Text>
            </Pressable>

            {user ? (
              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleting}
                className="mt-3 h-10 items-center justify-center rounded-[18px] px-5 active:opacity-70"
                style={{ backgroundColor: colors.warningSoft }}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.warning} />
                ) : (
                  <Text className="text-sm font-semibold" style={{ color: colors.warning }}>
                    {t('settings.deleteAccount')}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {user ? (
            <View
              className="mb-5 rounded-[28px] p-5"
              style={{
                backgroundColor: colors.frosted,
                borderWidth: 1,
                borderColor: colors.frostedBorder,
              }}
            >
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.text }}>
                {t('settings.plan')}
              </Text>
              <Text className="mb-1 text-3xl font-bold" style={{ color: colors.text }}>
                {planLabel}
              </Text>
              <Text className="mb-2 text-sm" style={{ color: colors.accent }}>
                {planDetail}
              </Text>
              <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('settings.planBlurb', {
                  price: PLUS_PRICE_DISPLAY,
                  billingNote: t('settings.billingNote'),
                })}
              </Text>
              {subscriptionActive ? (
                <Pressable
                  className="mt-3 self-start rounded-[18px] px-4 py-2 active:opacity-80"
                  style={{ backgroundColor: colors.warningSoft }}
                  onPress={() => void handleCancelPlus()}
                  disabled={planBusy}
                >
                  {planBusy ? (
                    <ActivityIndicator color={colors.warning} />
                  ) : (
                    <Text className="text-sm font-bold" style={{ color: colors.warning }}>
                      {t('settings.cancelSubscription')}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  className="mt-3 self-start rounded-[18px] px-4 py-2 active:opacity-80"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => void handleUpgrade()}
                  disabled={planBusy}
                >
                  {planBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-sm font-bold text-white">{t('settings.upgrade')}</Text>
                  )}
                </Pressable>
              )}
            </View>
          ) : null}

          {isAdmin ? (
            <Pressable
              onPress={() => router.push('/admin/usage')}
              className="mb-5 rounded-[28px] p-5 active:opacity-80"
              style={{
                backgroundColor: colors.frosted,
                borderWidth: 1,
                borderColor: colors.frostedBorder,
              }}
            >
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.text }}>
                {t('settings.adminTitle')}
              </Text>
              <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('settings.adminBody')}
              </Text>
            </Pressable>
          ) : null}

          <View
            className="mb-5 rounded-[28px] p-5"
            style={{
              backgroundColor: colors.frosted,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
            }}
          >
            <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
              {t('settings.language')}
            </Text>
            <LanguagePicker />
            <Text className="mt-2 text-xs leading-5" style={{ color: colors.textSecondary }}>
              {t('settings.languageHint')}
            </Text>
            <Text className="mb-3 mt-5 text-sm font-semibold" style={{ color: colors.text }}>
              {t('settings.lightDark')}
            </Text>
            <ThemeToggle />
            <Text className="mb-4 mt-5 text-sm font-semibold" style={{ color: colors.text }}>
              {t('settings.driftTheme')}
            </Text>
            <ThemePackPicker />
            <Text className="mb-3 mt-5 text-sm font-semibold" style={{ color: colors.text }}>
              {t('settings.measurements')}
            </Text>
            <MeasurementToggle />
            <Text className="mt-2 text-xs leading-5" style={{ color: colors.textSecondary }}>
              {t('settings.measurementsHint')}
            </Text>
          </View>

          {migrationError && (
            <View
              className="mb-5 rounded-[28px] p-4"
              style={{ backgroundColor: colors.warningSoft }}
            >
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.warning }}>
                {t('settings.migrationTitle')}
              </Text>
              <Text className="mb-3 text-sm leading-5" style={{ color: colors.warning }}>
                {migrationError}
              </Text>
              <Pressable
                onPress={() => void retryMigration()}
                className="items-center rounded-[22px] py-3 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-bold text-white">{t('settings.migrationRetry')}</Text>
              </Pressable>
            </View>
          )}

          <View
            className="mb-5 rounded-[28px] p-5"
            style={{
              backgroundColor: colors.frosted,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
            }}
          >
            <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
              {t('settings.legalSupport')}
            </Text>
            {(
              [
                [t('settings.privacyPolicy'), LEGAL_URLS.privacy],
                [t('settings.termsOfUse'), LEGAL_URLS.terms],
                [t('settings.deleteAccountWeb'), LEGAL_URLS.deleteAccount],
              ] as const
            ).map(([label, url]) => (
              <Pressable
                key={url}
                onPress={() => void openLegalUrl(url)}
                className="mb-2 py-2 active:opacity-70"
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                  {label}
                </Text>
              </Pressable>
            ))}
            {user ? (
              <Pressable
                onPress={() => setSupportOpen(true)}
                className="mb-2 py-2 active:opacity-70"
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                  {t('settings.reportIssue')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)}
              className="py-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {t('settings.emailSupport')}
              </Text>
            </Pressable>
          </View>

          <View className="items-center gap-2 pt-2">
            <CookieMark size={18} color={colors.textSecondary} />
            <Text className="text-center text-xs" style={{ color: colors.textSecondary }}>
              v{Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <SupportTicketModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </Screen>
  );
}
