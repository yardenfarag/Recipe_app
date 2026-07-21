import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { getPasswordStrength, validatePassword } from '@/lib/authValidation';
import { consumePasswordRecoveryUrl, updatePassword } from '@/lib/supabase/auth';

export default function ResetPasswordScreen() {
  const recoveryUrl = Linking.useLinkingURL();
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useThemePreference();

  useEffect(() => {
    if (!recoveryUrl) {
      setReady(false);
      setError('Open the reset link from your email to continue.');
      return;
    }

    let active = true;
    setError(null);
    setReady(false);
    consumePasswordRecoveryUrl(recoveryUrl)
      .then(() => {
        if (active) {
          setError(null);
          setReady(true);
        }
      })
      .catch((err) => {
        if (active) {
          setReady(false);
          setError(
            err instanceof Error ? err.message : 'This password reset link is invalid or expired.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [recoveryUrl]);

  async function handleUpdatePassword() {
    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your password could not be updated.');
    } finally {
      setLoading(false);
    }
  }

  const strength = getPasswordStrength(password);
  const canSubmit = ready && Boolean(password && confirmation) && !loading;

  if (done) {
    return (
      <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center pb-10">
          <View
            className="mb-5 h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="checkmark-circle-outline" size={34} color={colors.primary} />
          </View>
          <Text className="mb-2 text-center text-2xl font-bold" style={{ color: colors.text }}>
            Password updated
          </Text>
          <Text className="mb-8 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            You’re signed in. Your recipes are ready whenever you are.
          </Text>
          <Pressable
            className="w-full items-center rounded-full py-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.replace('/')}
          >
            <Text className="text-lg font-bold text-white">Go to library</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 px-6 pt-8" style={{ backgroundColor: colors.background }}>
      <View
        className="mb-6 h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Ionicons name="lock-open-outline" size={24} color={colors.primary} />
      </View>
      <Text className="mb-2 text-2xl font-bold" style={{ color: colors.text }}>
        Choose a new password
      </Text>
      <Text className="mb-6 text-sm leading-5" style={{ color: colors.textSecondary }}>
        Use at least 8 characters with one letter and one number.
      </Text>

      {!ready && !error && <ActivityIndicator color={colors.primary} />}

      {ready && (
        <>
          <View
            className="mb-3 flex-row items-center rounded-2xl border px-4"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <TextInput
              className="flex-1 py-4 text-base"
              style={{ color: colors.text }}
              placeholder="New password"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPassword((value) => !value)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          <View className="mb-4">
            <View className="mb-1.5 flex-row gap-1.5">
              {[0, 1, 2].map((index) => {
                const activeCount = strength === 'strong' ? 3 : strength === 'good' ? 2 : 1;
                const barColor =
                  index < activeCount
                    ? strength === 'strong'
                      ? colors.success
                      : strength === 'good'
                        ? colors.warning
                        : colors.danger
                    : colors.border;
                return (
                  <View
                    key={index}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ backgroundColor: barColor }}
                  />
                );
              })}
            </View>
            <Text className="text-xs" style={{ color: colors.textSecondary }}>
              {strength[0].toUpperCase()}
              {strength.slice(1)} password
            </Text>
          </View>

          <TextInput
            className="mb-5 rounded-2xl border px-4 py-4 text-base"
            style={{
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textSecondary}
            value={confirmation}
            onChangeText={(value) => {
              setConfirmation(value);
              if (error) setError(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!loading}
            onSubmitEditing={() => {
              if (canSubmit) void handleUpdatePassword();
            }}
          />
        </>
      )}

      {error && (
        <View
          className="mb-5 rounded-2xl border px-4 py-3"
          style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
        >
          <Text className="text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        </View>
      )}

      {ready && (
        <Pressable
          className="items-center rounded-full py-4"
          style={{ backgroundColor: canSubmit ? colors.primary : colors.border }}
          onPress={handleUpdatePassword}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-lg font-bold text-white">Update password</Text>
          )}
        </Pressable>
      )}

      {error && !ready && (
        <Pressable
          className="mt-4 items-center rounded-full border py-3.5"
          style={{ borderColor: colors.border }}
          onPress={() => router.replace('/auth?mode=forgot')}
        >
          <Text className="text-base font-semibold" style={{ color: colors.text }}>
            Request a new reset link
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
