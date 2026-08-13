import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { CookieMark } from '@/components/CookieMark';
import { Screen } from '@/components/Screen';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useProfile } from '@/hooks/useProfile';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTranslation } from 'react-i18next';
import { confirmAction, confirmDestructive } from '@/lib/confirmAction';
import {
  deleteAccount,
  requestAppleAuthorizationCodeForDeletion,
  signOut,
  userHasAppleIdentity,
} from '@/lib/supabase/auth';
import { uploadAvatar } from '@/lib/supabase/profile';

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
        >
          <Ionicons name={icon} size={17} color={tone} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold" style={{ color: danger ? tone : colors.text }}>
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
        className="overflow-hidden rounded-[24px] border p-5"
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
  description?: string;
};

function SettingsActionRow({
  label,
  icon,
  onPress,
  destructive = false,
  last = false,
  disabled = false,
  description,
}: SettingsActionRowProps) {
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();
  const color = destructive ? colors.warning : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-12 flex-row items-center gap-3 py-3 active:opacity-65 disabled:opacity-50"
      style={{
        borderColor: colors.frostedBorder,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: destructive ? colors.warningSoft : colors.primarySoft }}
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
          <BrandHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

          <View
            className="mb-6 mt-6 rounded-[28px] p-5"
            style={{
              backgroundColor: colors.frosted,
              borderWidth: 1,
              borderColor: colors.frostedBorder,
            }}
          >
            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={handleChangeAvatar}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel={t('settings.changeAvatarTitle')}
                className="relative"
              >
                <View
                  className="h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: colors.primarySoft }}
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
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={12} color="#fff" />
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

            <Pressable
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
            <View className="mb-5 rounded-[24px] p-4" style={{ backgroundColor: colors.warningSoft }}>
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.warning }}>
                {t('settings.migrationTitle')}
              </Text>
              <Text className="mb-3 text-sm leading-5" style={{ color: colors.warning }}>
                {t('errorBoundary.body')}
              </Text>
              <Pressable
                onPress={() => void retryMigration()}
                accessibilityRole="button"
                className="items-center rounded-[18px] py-3 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-bold text-white">{t('settings.migrationRetry')}</Text>
              </Pressable>
            </View>
          ) : null}

          <SettingsSection title={t('settings.yourSettings')} icon="options-outline">
            {user ? (
              <SettingsActionRow
                label={t('settings.plan')}
                description={t('settings.creditsTotal', { count: totalCredits ?? 0 })}
                icon="sparkles-outline"
                onPress={() => router.push('/settings/credits')}
              />
            ) : null}
            <SettingsActionRow
              label={t('settings.recipePreferences')}
              description={t('settings.recipePreferencesHint')}
              icon="restaurant-outline"
              onPress={() => router.push('/settings/recipe')}
            />
            <SettingsActionRow
              label={t('settings.appearance')}
              description={t('settings.appearanceHint')}
              icon="color-palette-outline"
              onPress={() => router.push('/settings/appearance')}
            />
            <SettingsActionRow
              label={t('settings.languageAndRegion')}
              description={t('settings.languageHint')}
              icon="language-outline"
              onPress={() => router.push('/settings/language')}
            />
            <SettingsActionRow
              label={t('settings.legalSupport')}
              description={t('settings.legalSupportHint')}
              icon="help-buoy-outline"
              onPress={() => router.push('/settings/support')}
              last
            />
          </SettingsSection>

          {isAdmin ? (
            <SettingsSection title={t('settings.adminTitle')} icon="shield-checkmark-outline">
              <Text className="mb-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('settings.adminBody')}
              </Text>
              <SettingsActionRow
                label={t('settings.adminTitle')}
                icon="analytics-outline"
                onPress={() => router.push('/admin/usage')}
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
                label={t('settings.deleteAccount')}
                icon="trash-outline"
                onPress={handleDeleteAccount}
                destructive
                disabled={deleting}
                last
              />
              {deleting ? (
                <ActivityIndicator className="mt-2" color={colors.warning} />
              ) : null}
            </SettingsSection>
          ) : null}

          <View className="items-center gap-2 pt-2">
            <CookieMark size={18} color={colors.textSecondary} />
            <Text className="text-center text-xs" style={{ color: colors.textSecondary }}>
              v{Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.0.0'}
              {Constants.nativeBuildVersion
                ? ` (${Constants.nativeBuildVersion})`
                : ''}
            </Text>
          </View>
        </View>
      </ScrollView>

    </Screen>
  );
}
