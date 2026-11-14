import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/ui/Pressable';

import { BrandHeader } from '@/components/BrandHeader';
import { CookieMark } from '@/components/CookieMark';
import { FeedbackModal } from '@/components/FeedbackModal';
import { Screen } from '@/components/Screen';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useProfile } from '@/hooks/useProfile';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTranslation } from 'react-i18next';
import { announce } from '@/lib/a11y';
import { captureAppShared } from '@/lib/analytics';
import { confirmAction, confirmDestructive, showNotice } from '@/lib/confirmAction';
import {
  parseRecipeBackup,
  recipeBackupFileName,
  RecipeBackupError,
  type ParsedRecipeBackup,
} from '@/lib/recipeBackup';
import { pickRecipeBackupFile, saveRecipeBackupFile } from '@/lib/recipeBackupFile';
import { shareApp } from '@/lib/shareApp';
import {
  deleteAccount,
  requestAppleAuthorizationCodeForDeletion,
  signOut,
  userHasAppleIdentity,
} from '@/lib/supabase/auth';
import { uploadAvatar } from '@/lib/supabase/profile';
import { fetchRecipeBackup, restoreRecipeBackup } from '@/lib/supabase/recipeBackup';

const RESTORE_ERROR_KEYS = {
  not_json: 'settings.restoreNotBackup',
  not_backup: 'settings.restoreNotBackup',
  newer_version: 'settings.restoreNewerVersion',
  too_large: 'settings.restoreTooLarge',
} as const;

type SettingsSectionProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  description?: string;
  danger?: boolean;
};

function SettingsSection({
  title,
  icon,
  children,
  description,
  danger = false,
}: SettingsSectionProps) {
  const { colors } = useThemePreference();
  const tone = danger ? colors.warning : colors.primary;

  return (
    <View className="mb-5">
      <View className="mb-2.5 flex-row items-center gap-2 px-1">
        <View
          className="h-8 w-8 items-center justify-center rounded-[12px]"
          style={{ backgroundColor: danger ? colors.warningSoft : colors.primarySoft }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name={icon} size={17} color={tone} />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-base font-bold"
            style={{ color: danger ? tone : colors.text }}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {description ? (
            <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.textSecondary }}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        className="overflow-hidden rounded-3xl border p-5"
        style={{
          backgroundColor: colors.frosted,
          borderColor: danger ? colors.warning : colors.frostedBorder,
        }}
      >
        {children}
      </View>
    </View>
  );
}

type SettingsActionRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
  disabled?: boolean;
  busy?: boolean;
  description?: string;
  /** Fixed id for the admin Activity log, like 'settings.appearance'. */
  trackId: string;
};

function SettingsActionRow({
  label,
  icon,
  onPress,
  destructive = false,
  last = false,
  disabled = false,
  busy = false,
  description,
  trackId,
}: SettingsActionRowProps) {
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();
  const color = destructive ? colors.warning : colors.text;

  return (
    <Pressable trackId={trackId}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      className="min-h-12 flex-row items-center gap-3 py-3 active:opacity-65 disabled:opacity-50"
      style={{
        borderColor: colors.frostedBorder,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: destructive ? colors.warningSoft : colors.primarySoft }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={18} color={destructive ? colors.warning : colors.primary} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold" style={{ color }}>
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.textSecondary }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={chevronForward}
        size={17}
        color={destructive ? colors.warning : colors.textSecondary}
        accessible={false}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { user, migrationError, retryMigration } = useAuth();
  const {
    avatarUrl,
    totalCredits,
    isAdmin,
    refresh,
  } = useProfile();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null);

  useEffect(() => {
    if (migrationError) announce(t('settings.migrationTitle'));
  }, [migrationError, t]);

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

    void (async () => {
      const first = await confirmDestructive(
        t('settings.deleteConfirmTitle'),
        t('settings.deleteConfirmBody'),
        t('common.continue'),
      );
      if (!first) return;
      const second = await confirmDestructive(
        t('settings.deleteConfirmFinalTitle'),
        t('settings.deleteConfirmFinalBody'),
        t('settings.deleteAccount'),
      );
      if (second) void confirmDeleteAccount();
    })();
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

  async function handleShareApp() {
    try {
      const outcome = await shareApp({
        title: t('settings.shareAppTitle'),
        message: t('settings.shareAppMessage'),
      });
      captureAppShared({ outcome, platform: Platform.OS });
      if (outcome === 'copied') Alert.alert(t('settings.shareAppCopied'));
    } catch {
      Alert.alert(t('settings.shareAppFailedTitle'), t('common.tryAgain'));
    }
  }

  async function handleDownloadRecipes() {
    if (!user || backupBusy) return;
    setBackupBusy('export');
    try {
      const backup = await fetchRecipeBackup();
      if (backup.recipes.length === 0) {
        await showNotice(t('settings.backupEmptyTitle'), t('settings.backupEmptyBody'));
        return;
      }
      await saveRecipeBackupFile(JSON.stringify(backup, null, 2), recipeBackupFileName());
    } catch (err) {
      await showNotice(
        t('settings.backupFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleRestoreRecipes() {
    if (!user || backupBusy) return;

    let backup: ParsedRecipeBackup;
    try {
      const text = await pickRecipeBackupFile();
      if (text == null) return;
      backup = parseRecipeBackup(text);
    } catch (err) {
      await showNotice(
        t('settings.restoreFailedTitle'),
        err instanceof RecipeBackupError
          ? t(RESTORE_ERROR_KEYS[err.code])
          : err instanceof Error
            ? err.message
            : t('common.tryAgain'),
      );
      return;
    }

    if (backup.recipes.length === 0) {
      await showNotice(t('settings.restoreFailedTitle'), t('settings.restoreEmpty'));
      return;
    }

    const ok = await confirmAction(
      t('settings.restoreConfirmTitle'),
      t('settings.restoreConfirmBody', { count: backup.recipes.length }),
      t('settings.restoreConfirm'),
      t('common.cancel'),
    );
    if (!ok) return;

    setBackupBusy('restore');
    try {
      const result = await restoreRecipeBackup(backup);
      const body = t('settings.restoreDoneBody', { added: result.added, skipped: result.skipped });
      await showNotice(
        t('settings.restoreDoneTitle'),
        result.invalid > 0
          ? `${body} ${t('settings.restoreInvalidNote', { count: result.invalid })}`
          : body,
      );
    } catch {
      await showNotice(t('settings.restoreFailedTitle'), t('settings.restoreFailedBody'));
    } finally {
      setBackupBusy(null);
    }
  }

  function handleChangeAvatar() {
    if (!user) {
      void (async () => {
        const ok = await confirmAction(
          t('settings.signInRequiredTitle'),
          t('settings.signInRequiredBody'),
          t('settings.signIn'),
        );
        if (ok) router.push('/auth?mode=signin&reason=sync');
      })();
      return;
    }

    if (Platform.OS === 'web') {
      void pickImage('library');
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
      // Web gives a data: URI, so prefer the picker's mime type over the path.
      const fileExt =
        asset.mimeType?.split('/')[1]?.toLowerCase() ??
        asset.uri.split('.').pop()?.toLowerCase() ??
        'jpg';
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

  const planLabel = t('settings.recipeCredits');

  return (
    <Screen dense tabScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="px-5 pt-1"
          style={
            isMediumUp
              ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
        >
          <BrandHeader title={t('settings.title')} />

          <View
            className="mb-6 mt-6 rounded-3xl p-5"
            style={{
              backgroundColor: colors.frosted,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
            }}
          >
            <View className="flex-row items-center gap-4">
              <Pressable trackId="settings.avatar.change"
                onPress={handleChangeAvatar}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel={t('settings.changeAvatarTitle')}
                accessibilityState={{ disabled: uploading, busy: uploading }}
                className="relative"
              >
                <View
                  className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: colors.primarySoft }}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{ width: 72, height: 72, backgroundColor: colors.primarySoft }}
                      contentFit="cover"
                      contentPosition="center"
                      transition={200}
                    />
                  ) : (
                    <Ionicons name="person" size={31} color={colors.primary} />
                  )}
                </View>
                <View
                  className="absolute bottom-0 h-7 w-7 items-center justify-center rounded-full border-2"
                  style={{
                    backgroundColor: colors.primary,
                    borderColor: colors.surface,
                    end: 0,
                  }}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Ionicons name="camera" size={12} color={colors.onPrimary} />
                  )}
                </View>
              </Pressable>

              <View className="min-w-0 flex-1">
                <Text className="text-base font-bold" style={{ color: colors.text }} numberOfLines={1}>
                  {user?.email ?? t('settings.guest')}
                </Text>
                <Text className="mt-1 text-xs leading-4" style={{ color: colors.textSecondary }}>
                  {user
                    ? t('settings.signedIn', { plan: planLabel })
                    : t('settings.signInToSync')}
                </Text>
              </View>
            </View>

            <Pressable trackId={user ? 'settings.sign_out' : 'settings.sign_in'}
              onPress={() =>
                user ? void handleSignOut() : router.push('/auth?mode=signin&reason=sync')
              }
              accessibilityRole="button"
              className="mt-4 min-h-11 items-center justify-center rounded-[18px] px-5 active:opacity-70"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {user ? t('settings.signOut') : t('settings.signIn')}
              </Text>
            </Pressable>
          </View>

          {migrationError ? (
            <View
              className="mb-5 rounded-[24px] p-4"
              style={{ backgroundColor: colors.warningSoft }}
            >
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.warning }}>
                {t('settings.migrationTitle')}
              </Text>
              <Text className="mb-3 text-sm leading-5" style={{ color: colors.warning }}>
                {t('errorBoundary.body')}
              </Text>
              <Pressable trackId="settings.migration.retry"
                onPress={() => void retryMigration()}
                accessibilityRole="button"
                className="items-center rounded-[18px] py-3 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>
                  {t('settings.migrationRetry')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <SettingsSection title={t('settings.yourSettings')} icon="options-outline">
            {user ? (
              <SettingsActionRow
                trackId="settings.plan"
                label={t('settings.plan')}
                description={
                  totalCredits == null
                    ? undefined
                    : t('settings.creditsTotal', { count: totalCredits })
                }
                icon="sparkles-outline"
                onPress={() => router.push('/settings/credits')}
              />
            ) : null}
            <SettingsActionRow
              trackId="settings.recipe_preferences"
              label={t('settings.recipePreferences')}
              description={t('settings.recipePreferencesHint')}
              icon="restaurant-outline"
              onPress={() => router.push('/settings/recipe')}
            />
            <SettingsActionRow
              trackId="settings.cookbook"
              label={t('settings.cookbook')}
              description={t('settings.cookbookHint')}
              icon="book-outline"
              onPress={() => router.push('/cookbook')}
            />
            <SettingsActionRow
              trackId="settings.appearance"
              label={t('settings.appearance')}
              description={t('settings.appearanceHint')}
              icon="color-palette-outline"
              onPress={() => router.push('/settings/appearance')}
            />
            <SettingsActionRow
              trackId="settings.language"
              label={t('settings.languageAndRegion')}
              description={t('settings.languageHint')}
              icon="language-outline"
              onPress={() => router.push('/settings/language')}
            />
            <SettingsActionRow
              trackId="settings.legal_support"
              label={t('settings.legalSupport')}
              description={t('settings.legalSupportHint')}
              icon="help-buoy-outline"
              onPress={() => router.push('/settings/support')}
            />
            {user ? (
              <SettingsActionRow
                trackId="settings.send_feedback"
                label={t('settings.sendFeedback')}
                description={t('settings.sendFeedbackHint')}
                icon="chatbox-ellipses-outline"
                onPress={() => setFeedbackOpen(true)}
              />
            ) : null}
            <SettingsActionRow
              trackId="settings.share_app"
              label={t('settings.shareApp')}
              description={t('settings.shareAppHint')}
              icon="share-social-outline"
              onPress={() => void handleShareApp()}
              last
            />
          </SettingsSection>

          {user ? (
            <SettingsSection
              title={t('settings.yourRecipes')}
              icon="archive-outline"
              description={t('settings.yourRecipesHint')}
            >
              <SettingsActionRow
                trackId="settings.backup.download"
                label={t('settings.backupDownload')}
                description={t('settings.backupDownloadHint')}
                icon="download-outline"
                onPress={() => void handleDownloadRecipes()}
                disabled={backupBusy !== null}
                busy={backupBusy === 'export'}
              />
              <SettingsActionRow
                trackId="settings.backup.restore"
                label={t('settings.backupRestore')}
                description={t('settings.backupRestoreHint')}
                icon="cloud-upload-outline"
                onPress={() => void handleRestoreRecipes()}
                disabled={backupBusy !== null}
                busy={backupBusy === 'restore'}
                last
              />
              {backupBusy ? (
                <ActivityIndicator className="mt-2" color={colors.primary} />
              ) : null}
            </SettingsSection>
          ) : null}

          {isAdmin ? (
            <SettingsSection title={t('settings.adminTitle')} icon="shield-checkmark-outline">
              <Text className="mb-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('settings.adminBody')}
              </Text>
              <SettingsActionRow
                trackId="settings.admin.insights"
                label={t('settings.adminInsights')}
                icon="analytics-outline"
                onPress={() => router.push('/admin/insights')}
              />
              <SettingsActionRow
                trackId="settings.admin.people"
                label={t('settings.adminPeople')}
                icon="people-outline"
                onPress={() => router.push('/admin/users')}
              />
              <SettingsActionRow
                trackId="settings.admin.usage"
                label={t('settings.adminUsage')}
                icon="receipt-outline"
                onPress={() => router.push('/admin/usage')}
              />
              <SettingsActionRow
                trackId="settings.admin.activity"
                label={t('settings.adminActivity')}
                icon="footsteps-outline"
                onPress={() => router.push('/admin/activity')}
                last
              />
            </SettingsSection>
          ) : null}

          {user ? (
            <SettingsSection
              title={t('settings.dangerZone')}
              icon="warning-outline"
              description={t('settings.dangerZoneHint')}
              danger
            >
              <SettingsActionRow
                trackId="settings.delete_account"
                label={t('settings.deleteAccount')}
                icon="trash-outline"
                onPress={handleDeleteAccount}
                destructive
                disabled={deleting}
                busy={deleting}
                last
              />
              {deleting ? (
                <ActivityIndicator className="mt-2" color={colors.warning} />
              ) : null}
            </SettingsSection>
          ) : null}

          <View className="items-center gap-2 pt-2">
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <CookieMark size={18} color={colors.textSecondary} />
            </View>
            <Text className="text-center text-xs" style={{ color: colors.textSecondary }}>
              v{Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0'}
              {Constants.nativeBuildVersion
                ? ` (${Constants.nativeBuildVersion})`
                : ''}
            </Text>
          </View>
        </View>
      </ScrollView>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </Screen>
  );
}
