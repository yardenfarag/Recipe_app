import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { Pressable } from '@/components/ui/Pressable';

import { AvatarPickerModal } from '@/components/AvatarPickerModal';
import { CookieMark } from '@/components/CookieMark';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsMenu';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { TopBar } from '@/components/ui/TopBar';
import { HAIRLINE } from '@/components/ui/tokens';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { APP_LANGUAGES } from '@shared/lib/appLanguages';
import { useTranslation } from 'react-i18next';
import { showToast } from '@shared/lib/toast';
import { announce } from '@/lib/a11y';
import { captureAppShared } from '@/lib/analytics';
import { askConfirm, showNotice } from '@/lib/dialog';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';
import {
  parseRecipeBackup,
  recipeBackupFileName,
  RecipeBackupError,
  type ParsedRecipeBackup,
} from '@shared/lib/recipeBackup';
import { pickRecipeBackupFile, saveRecipeBackupFile } from '@/lib/recipeBackupFile';
import { shareApp } from '@/lib/shareApp';
import {
  deleteAccount,
  requestAppleAuthorizationCodeForDeletion,
  signOut,
  userHasAppleIdentity,
} from '@/lib/supabase/auth';
import type { FoodAvatarId } from '@shared/lib/foodAvatars';
import { chooseFoodAvatar, uploadAvatar } from '@shared/lib/supabase/profile';
import { fetchRecipeBackup, restoreRecipeBackup } from '@shared/lib/supabase/recipeBackup';

const RESTORE_ERROR_KEYS = {
  not_json: 'settings.restoreNotBackup',
  not_backup: 'settings.restoreNotBackup',
  newer_version: 'settings.restoreNewerVersion',
  too_large: 'settings.restoreTooLarge',
} as const;

/** Light, dark or automatic, as the Appearance row shows it. */
const MODE_LABEL = { system: 'theme.auto', light: 'theme.light', dark: 'theme.dark' } as const;

/** A count in the app language's digits and grouping ("1,200"). */
function formatCount(count: number, language: string): string {
  try {
    return new Intl.NumberFormat(language).format(count);
  } catch {
    return String(count);
  }
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
  const { colors, preference, packId } = useThemePreference();
  const { language } = useLanguagePreference();
  const { isMediumUp } = useBreakpoint();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<FoodAvatarId | 'camera' | 'library' | null>(null);
  const uploading = avatarBusy != null;
  const [deleting, setDeleting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
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
      if (Platform.OS === 'web') {
        // The app's own dialog, asked once: everything that goes spelled out, and a red button.
        const confirmed = await askConfirm({
          trackId: 'settings.delete_account_dialog',
          title: t('settings.deleteConfirmTitle'),
          message: t('settings.deleteConfirmBody'),
          confirmLabel: t('settings.deleteAccount'),
          destructive: true,
        });
        if (confirmed) void confirmDeleteAccount();
        return;
      }
      // A phone asks twice, in the system alert: one tap there is too easy.
      const first = await askConfirm({
        title: t('settings.deleteConfirmTitle'),
        message: t('settings.deleteConfirmBody'),
        confirmLabel: t('common.continue'),
        destructive: true,
      });
      if (!first) return;
      const second = await askConfirm({
        title: t('settings.deleteConfirmFinalTitle'),
        message: t('settings.deleteConfirmFinalBody'),
        confirmLabel: t('settings.deleteAccount'),
        destructive: true,
      });
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
      // On the web the root DialogHost draws it, so it shows after this screen is gone.
      void showNotice({
        trackId: 'settings.account_deleted_notice',
        title: t('settings.deleteSuccessTitle'),
        message: t('settings.deleteSuccessBody'),
      });
    } catch (err) {
      void showNotice({
        trackId: 'settings.delete_account_failed_notice',
        title: t('settings.deleteFailedTitle'),
        message: err instanceof Error ? err.message : t('common.tryAgain'),
      });
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
      if (outcome === 'copied') showToast(t('settings.shareAppCopied'));
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
        await showNotice({ title: t('settings.backupEmptyTitle'), message: t('settings.backupEmptyBody') });
        return;
      }
      await saveRecipeBackupFile(JSON.stringify(backup, null, 2), recipeBackupFileName());
    } catch (err) {
      await showNotice({
        title: t('settings.backupFailedTitle'),
        message: err instanceof Error ? err.message : t('common.tryAgain'),
      });
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
      await showNotice({
        title: t('settings.restoreFailedTitle'),
        message:
          err instanceof RecipeBackupError
            ? t(RESTORE_ERROR_KEYS[err.code])
            : err instanceof Error
              ? err.message
              : t('common.tryAgain'),
      });
      return;
    }

    if (backup.recipes.length === 0) {
      await showNotice({ title: t('settings.restoreFailedTitle'), message: t('settings.restoreEmpty') });
      return;
    }

    const ok = await askConfirm({
      trackId: 'settings.restore_recipes_dialog',
      title: t('settings.restoreConfirmTitle'),
      message: t('settings.restoreConfirmBody', { count: backup.recipes.length }),
      confirmLabel: t('settings.restoreConfirm'),
    });
    if (!ok) return;

    setBackupBusy('restore');
    try {
      const result = await restoreRecipeBackup(backup);
      const body = t('settings.restoreDoneBody', { added: result.added, skipped: result.skipped });
      await showNotice({
        title: t('settings.restoreDoneTitle'),
        message:
          result.invalid > 0 ? `${body} ${t('settings.restoreInvalidNote', { count: result.invalid })}` : body,
      });
    } catch {
      await showNotice({ title: t('settings.restoreFailedTitle'), message: t('settings.restoreFailedBody') });
    } finally {
      setBackupBusy(null);
    }
  }

  function handleChangeAvatar() {
    if (!user) {
      void (async () => {
        const ok = await askConfirm({
          trackId: 'settings.avatar_sign_in_dialog',
          title: t('settings.signInRequiredTitle'),
          message: t('settings.signInRequiredBody'),
          confirmLabel: t('settings.signIn'),
        });
        if (ok) router.push('/auth?mode=signin&reason=sync');
      })();
      return;
    }

    setAvatarPickerOpen(true);
  }

  async function pickFoodAvatar(id: FoodAvatarId) {
    if (!user || avatarBusy) return;
    setAvatarBusy(id);
    try {
      await chooseFoodAvatar(user.id, id);
      await refresh();
      setAvatarPickerOpen(false);
    } catch {
      showToast(t('settings.avatarSaveFailed'), 'error');
    } finally {
      setAvatarBusy(null);
    }
  }

  /** Runs while the picker sheet is still open: the system picker opens over it, and the sheet closes once saved. */
  async function pickImage(source: 'camera' | 'library') {
    if (!user || avatarBusy) return;

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

      setAvatarBusy(source);
      // Web gives a data: URI, so prefer the picker's mime type over the path.
      const fileExt =
        asset.mimeType?.split('/')[1]?.toLowerCase() ??
        asset.uri.split('.').pop()?.toLowerCase() ??
        'jpg';
      await uploadAvatar(user.id, asset.base64, fileExt);
      await refresh();
      setAvatarPickerOpen(false);
    } catch (err) {
      Alert.alert(
        t('settings.uploadFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setAvatarBusy(null);
    }
  }

  // "Signed in · 25 credits available"; just "Recipe credits" until the balance loads.
  const planLabel =
    totalCredits == null
      ? t('settings.recipeCredits')
      : t('settings.creditsTotal', { count: totalCredits });
  const appearanceValue = `${t(MODE_LABEL[preference])} · ${t(`themes.${packId}.name`)}`;
  const languageValue = APP_LANGUAGES.find((lang) => lang.code === language)?.nativeLabel;

  return (
    <Screen tabScreen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            { paddingHorizontal: 20, gap: 24 },
            isMediumUp ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' } : null,
          ]}
        >
          <View>
            {/* The balance is on the account tile below, so the bar carries only the logo. */}
            <TopBar credits={null} />
            <PageHeader title={t('settings.title')} style={{ paddingBottom: 0, marginTop: 8 }} />
          </View>

          {/* Who is signed in, the profile picture, and the credit balance. */}
          <Tile padding={20} style={{ gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Pressable
                trackId="settings.avatar.change"
                onPress={handleChangeAvatar}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel={t('settings.changeAvatarTitle')}
                accessibilityState={{ disabled: uploading, busy: uploading }}
                hitSlop={4}
              >
                <ProfileAvatar url={avatarUrl} size={64} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    end: -2,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    borderWidth: 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.primary,
                    borderColor: colors.surface,
                  }}
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Ionicons name="pencil" size={13} color={colors.onPrimary} />
                  )}
                </View>
              </Pressable>

              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text variant="h3" numberOfLines={1}>
                  {user?.email ?? t('settings.guest')}
                </Text>
                <Text variant="caption" tone="muted">
                  {user ? t('settings.signedIn', { plan: planLabel }) : t('settings.signInToSync')}
                </Text>
              </View>
            </View>

            {user ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingTop: 18,
                  borderTopWidth: HAIRLINE,
                  borderColor: colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                  <TileLabel>{t('web.credits.available')}</TileLabel>
                  {totalCredits == null ? (
                    <ActivityIndicator color={colors.accentText} style={{ alignSelf: 'flex-start', height: 54 }} />
                  ) : (
                    <Text variant="number" accessibilityLabel={t('settings.creditsTotal', { count: totalCredits })}>
                      {formatCount(totalCredits, language)}
                    </Text>
                  )}
                </View>
                <Button
                  trackId="settings.plan"
                  variant="secondary"
                  size="sm"
                  icon="add"
                  onPress={() => router.push('/settings/credits')}
                  accessibilityLabel={t('settings.plan')}
                  style={{ alignSelf: 'flex-end', marginBottom: 6 }}
                >
                  {t('web.credits.menuBuy')}
                </Button>
              </View>
            ) : null}

            <Button
              trackId={user ? 'settings.sign_out' : 'settings.sign_in'}
              variant={user ? 'outline' : 'primary'}
              fullWidth
              onPress={() => (user ? void handleSignOut() : router.push('/auth?mode=signin&reason=sync'))}
            >
              {user ? t('settings.signOut') : t('settings.signIn')}
            </Button>
          </Tile>

          {migrationError ? (
            <View style={{ borderRadius: 24, padding: 18, gap: 10, backgroundColor: colors.warningSoft }}>
              <Text variant="bodySmall" weight="semibold" color={colors.warning}>
                {t('settings.migrationTitle')}
              </Text>
              <Text variant="bodySmall">{t('errorBoundary.body')}</Text>
              <Button trackId="settings.migration.retry" fullWidth onPress={() => void retryMigration()}>
                {t('settings.migrationRetry')}
              </Button>
            </View>
          ) : null}

          <SettingsGroup title={t('settings.yourSettings')}>
            <SettingsRow
              trackId="settings.recipe_preferences"
              label={t('settings.recipePreferences')}
              description={t('settings.recipePreferencesHint')}
              icon="restaurant-outline"
              onPress={() => router.push('/settings/recipe')}
            />
            <SettingsRow
              trackId="settings.appearance"
              label={t('settings.appearance')}
              value={appearanceValue}
              icon="color-palette-outline"
              onPress={() => router.push('/settings/appearance')}
            />
            <SettingsRow
              trackId="settings.language"
              label={t('settings.languageAndRegion')}
              value={languageValue}
              icon="language-outline"
              onPress={() => router.push('/settings/language')}
            />
            {user ? (
              <SettingsRow
                trackId="settings.emails"
                label={t('messages.title')}
                description={t('messages.hint')}
                icon="mail-outline"
                onPress={() => router.push('/settings/emails')}
              />
            ) : null}
            <SettingsRow
              trackId="settings.cookbook"
              label={t('settings.cookbook')}
              description={t('settings.cookbookHint')}
              icon="book-outline"
              onPress={() => router.push('/cookbook')}
            />
          </SettingsGroup>

          <SettingsGroup title={t('web.settings.helpGroup')}>
            <SettingsRow
              trackId="settings.help_support"
              label={t('settings.helpSupport')}
              description={t('settings.helpSupportHint')}
              icon="help-buoy-outline"
              // Guests have no email to reply to, so they write to support@ directly.
              onPress={() => (user ? setSupportOpen(true) : void openLegalUrl(LEGAL_URLS.supportMailto))}
            />
            {user ? (
              <SettingsRow
                trackId="settings.send_feedback"
                label={t('settings.sendFeedback')}
                description={t('settings.sendFeedbackHint')}
                icon="chatbox-ellipses-outline"
                onPress={() => setFeedbackOpen(true)}
              />
            ) : null}
            <SettingsRow
              trackId="settings.legal_support"
              label={t('settings.legal')}
              description={t('settings.legalHint')}
              icon="document-text-outline"
              onPress={() => router.push('/settings/support')}
            />
            <SettingsRow
              trackId="settings.share_app"
              label={t('settings.shareApp')}
              description={t('settings.shareAppHint')}
              icon="share-social-outline"
              onPress={() => void handleShareApp()}
            />
          </SettingsGroup>

          {user ? (
            <SettingsGroup title={t('settings.yourRecipes')} description={t('settings.yourRecipesHint')}>
              <SettingsRow
                trackId="settings.backup.download"
                label={t('settings.backupDownload')}
                description={t('settings.backupDownloadHint')}
                icon="download-outline"
                onPress={() => void handleDownloadRecipes()}
                disabled={backupBusy !== null}
                busy={backupBusy === 'export'}
              />
              <SettingsRow
                trackId="settings.backup.restore"
                label={t('settings.backupRestore')}
                description={t('settings.backupRestoreHint')}
                icon="cloud-upload-outline"
                onPress={() => void handleRestoreRecipes()}
                disabled={backupBusy !== null}
                busy={backupBusy === 'restore'}
              />
            </SettingsGroup>
          ) : null}

          {isAdmin ? (
            <SettingsGroup title={t('settings.adminTitle')} description={t('settings.adminBody')}>
              {Platform.OS === 'web' ? (
                <SettingsRow
                  trackId="settings.admin.dashboard"
                  label={t('settings.adminDashboard')}
                  icon="speedometer-outline"
                  onPress={() => router.push('/admin/dashboard')}
                />
              ) : null}
              <SettingsRow
                trackId="settings.admin.insights"
                label={t('settings.adminInsights')}
                icon="analytics-outline"
                onPress={() => router.push('/admin/insights')}
              />
              <SettingsRow
                trackId="settings.admin.people"
                label={t('settings.adminPeople')}
                icon="people-outline"
                onPress={() => router.push('/admin/users')}
              />
              <SettingsRow
                trackId="settings.admin.usage"
                label={t('settings.adminUsage')}
                icon="receipt-outline"
                onPress={() => router.push('/admin/usage')}
              />
              <SettingsRow
                trackId="settings.admin.activity"
                label={t('settings.adminActivity')}
                icon="footsteps-outline"
                onPress={() => router.push('/admin/activity')}
              />
              <SettingsRow
                trackId="settings.admin.messages"
                label={t('settings.adminMessages')}
                icon="chatbubble-ellipses-outline"
                onPress={() => router.push('/admin/messages')}
              />
              <SettingsRow
                trackId="settings.admin.kit"
                label={t('settings.adminKit')}
                icon="color-palette-outline"
                onPress={() => router.push('/admin/kit')}
              />
            </SettingsGroup>
          ) : null}

          {user ? (
            <SettingsGroup title={t('settings.dangerZone')} description={t('settings.dangerZoneHint')} danger>
              <SettingsRow
                trackId="settings.delete_account"
                label={t('settings.deleteAccount')}
                icon="trash-outline"
                onPress={handleDeleteAccount}
                destructive
                disabled={deleting}
                busy={deleting}
              />
            </SettingsGroup>
          ) : null}

          <View style={{ alignItems: 'center', gap: 8 }}>
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <CookieMark size={18} color={colors.textSecondary} />
            </View>
            <Text variant="caption" tone="muted" align="center">
              v{Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0'}
              {Constants.nativeBuildVersion ? ` (${Constants.nativeBuildVersion})` : ''}
            </Text>
          </View>
        </View>
      </ScrollView>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <SupportTicketModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
      <AvatarPickerModal
        visible={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        current={avatarUrl}
        busy={avatarBusy}
        onPick={(id) => void pickFoodAvatar(id)}
        onPhoto={(source) => void pickImage(source)}
      />
    </Screen>
  );
}
