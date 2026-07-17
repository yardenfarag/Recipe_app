import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { signOut } from '@/lib/supabase/auth';
import { uploadAvatar } from '@/lib/supabase/profile';

export default function SettingsScreen() {
  const { user } = useAuth();
  const { avatarUrl, refresh } = useProfile();
  const { colors } = useThemePreference();
  const [uploading, setUploading] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleChangeAvatar() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in to add a profile picture.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/auth') },
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

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-3">
          <Text className="text-xs font-semibold uppercase tracking-widest text-pinch-rose dark:text-pinch-rose-dark">
            Pinch
          </Text>
          <Text className="mb-6 text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            Settings
          </Text>

          <View className="mb-6 items-center rounded-3xl border border-pinch-border bg-pinch-surface p-6 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
            <Pressable onPress={handleChangeAvatar} disabled={uploading} className="relative mb-3">
              <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
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
              <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-pinch-surface bg-pinch-primary dark:border-pinch-surface-dark dark:bg-pinch-primary-dark">
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
                )}
              </View>
            </Pressable>

            <Text className="mb-1 text-base font-semibold text-pinch-dark dark:text-pinch-text-dark">
              {user?.email ?? 'Guest'}
            </Text>
            <Text className="mb-4 text-center text-xs text-pinch-muted dark:text-pinch-muted-dark">
              {user ? 'Signed in' : 'Sign in to sync your recipes across devices'}
            </Text>

            <Pressable
              onPress={() => (user ? handleSignOut() : router.push('/auth'))}
              className="h-10 items-center justify-center rounded-full bg-pinch-primary-soft px-5 active:opacity-70 dark:bg-pinch-primary-soft-dark"
            >
              <Text className="text-sm font-semibold text-pinch-primary dark:text-pinch-primary-dark">
                {user ? 'Sign out' : 'Sign in'}
              </Text>
            </Pressable>
          </View>

          <View className="mb-6 rounded-3xl border border-pinch-border bg-pinch-surface p-5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
            <Text className="mb-3 text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
              Appearance
            </Text>
            <ThemeToggle />
          </View>

          <Text className="text-center text-xs text-pinch-muted dark:text-pinch-muted-dark">
            Pinch v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
