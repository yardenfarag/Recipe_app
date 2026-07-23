import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { CookieMark } from '@/components/CookieMark';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { Screen } from '@/components/Screen';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';
import { confirmAction, confirmDestructive } from '@/lib/confirmAction';
import {
  FREE_EXTRACT_LIMIT,
  PLUS_MONTHLY_EXTRACT_LIMIT,
  PLUS_PRICE_DISPLAY,
  PLUS_PRICE_NOTE,
} from '@/lib/quotas';
import {
  deleteAccount,
  requestAppleAuthorizationCodeForDeletion,
  signOut,
  userHasAppleIdentity,
} from '@/lib/supabase/auth';
import { uploadAvatar } from '@/lib/supabase/profile';

export default function SettingsScreen() {
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
    const ok = await confirmAction('Upgrade to Pinch Plus?', PLUS_PRICE_NOTE, 'Upgrade');
    if (!ok) return;
    setPlanBusy(true);
    try {
      await upgradeToPlus();
      Alert.alert('You’re on Plus', `${PLUS_MONTHLY_EXTRACT_LIMIT} recipe saves per month.`);
    } catch (err) {
      Alert.alert(
        'Could not upgrade',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleCancelPlus() {
    if (!user || planBusy) return;
    const ok = await confirmDestructive(
      'Cancel Pinch Plus?',
      'You’ll go back to the free plan. Remaining free saves are unchanged.',
      'Cancel Plus',
    );
    if (!ok) return;
    setPlanBusy(true);
    try {
      await cancelPlus();
      Alert.alert('Subscription canceled', 'You’re on the free plan again.');
    } catch (err) {
      Alert.alert(
        'Could not cancel',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleDeleteAccount() {
    if (!user || deleting) return;

    Alert.alert(
      'Delete account?',
      'This permanently removes your recipes, avatar, plan, and account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm deletion',
              'Are you sure you want to delete your Pinch account forever?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: () => void confirmDeleteAccount(),
                },
              ],
            );
          },
        },
      ],
    );
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
      Alert.alert('Account deleted', 'Your Pinch account and data have been removed.');
    } catch (err) {
      Alert.alert(
        'Could not delete account',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleChangeAvatar() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to add a profile picture.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/auth?mode=signin&reason=sync') },
      ]);
      return;
    }

    Alert.alert('Change profile picture', undefined, [
      { text: 'Take Photo', onPress: () => pickImage('camera') },
      { text: 'Choose from Library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
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
          'Permission needed',
          `Enable ${source === 'camera' ? 'camera' : 'photo library'} access for Pinch in your device settings to continue.`,
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
        Alert.alert('Something went wrong', 'Could not read the selected image.');
        return;
      }

      setUploading(true);
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      await uploadAvatar(user.id, asset.base64, fileExt);
      await refresh();
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const planLabel = subscriptionActive ? 'Pinch Plus' : 'Free';
  const planDetail = subscriptionActive
    ? extractsRemaining != null
      ? `${extractsRemaining}/${PLUS_MONTHLY_EXTRACT_LIMIT} saves left this month`
      : `${PLUS_MONTHLY_EXTRACT_LIMIT} saves / month`
    : extractsRemaining != null
      ? `${extractsRemaining}/${FREE_EXTRACT_LIMIT} free saves left`
      : `${FREE_EXTRACT_LIMIT} free lifetime saves`;

  return (
    <Screen dense tabScreen>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-1">
          <BrandHeader title="Settings" subtitle="Account & appearance" />

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
              {user?.email ?? 'Guest'}
            </Text>
            <Text className="mb-4 text-center text-xs" style={{ color: colors.textSecondary }}>
              {user
                ? `Signed in · ${planLabel}`
                : 'Sign in to sync your recipes across devices'}
            </Text>

            <Pressable
              onPress={() =>
                user ? handleSignOut() : router.push('/auth?mode=signin&reason=sync')
              }
              className="h-10 items-center justify-center rounded-[18px] px-5 active:opacity-70"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {user ? 'Sign out' : 'Sign in'}
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
                    Delete account
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
                Plan
              </Text>
              <Text className="mb-1 text-3xl font-bold" style={{ color: colors.text }}>
                {planLabel}
              </Text>
              <Text className="mb-2 text-sm" style={{ color: colors.accent }}>
                {planDetail}
              </Text>
              <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
                Pinch Plus is {PLUS_PRICE_DISPLAY} when billing launches. Cached recipes and remix /
                translate stay free of extract quota. {PLUS_PRICE_NOTE}
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
                      Cancel subscription
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
                    <Text className="text-sm font-bold text-white">Upgrade to Plus</Text>
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
                Admin · Usage & support
              </Text>
              <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
                Cost log, support tickets, and plan tools (you only).
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
              Light / dark
            </Text>
            <ThemeToggle />
            <Text className="mb-4 mt-5 text-sm font-semibold" style={{ color: colors.text }}>
              Drift theme
            </Text>
            <ThemePackPicker />
            <Text className="mb-3 mt-5 text-sm font-semibold" style={{ color: colors.text }}>
              Recipe measurements
            </Text>
            <MeasurementToggle />
            <Text className="mt-2 text-xs leading-5" style={{ color: colors.textSecondary }}>
              Default for every recipe — spoons & cups, or grams & milliliters. You can still flip it
              on any recipe.
            </Text>
          </View>

          {migrationError && (
            <View
              className="mb-5 rounded-[28px] p-4"
              style={{ backgroundColor: colors.warningSoft }}
            >
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.warning }}>
                Local recipes not synced
              </Text>
              <Text className="mb-3 text-sm leading-5" style={{ color: colors.warning }}>
                {migrationError}
              </Text>
              <Pressable
                onPress={() => void retryMigration()}
                className="items-center rounded-[22px] py-3 active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-bold text-white">Retry sync</Text>
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
              Legal &amp; support
            </Text>
            {(
              [
                ['Privacy Policy', LEGAL_URLS.privacy],
                ['Terms of Use', LEGAL_URLS.terms],
                ['Delete account (web)', LEGAL_URLS.deleteAccount],
              ] as const
            ).map(([label, url]) => (
              <Pressable
                key={label}
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
                  Report an issue
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)}
              className="py-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                Email support
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
