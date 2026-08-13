import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { getPasswordStrength, validatePassword } from '@/lib/authValidation';
import { consumePasswordRecoveryUrl, updatePassword } from '@/lib/supabase/auth';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const linkingUrl = Linking.useLinkingURL();
  const [recoveryUrl, setRecoveryUrl] = useState<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useThemePreference();

  useEffect(() => {
    if (linkingUrl) {
      setRecoveryUrl(linkingUrl);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        const initial = await Linking.getInitialURL();
        if (!active) return;
        setRecoveryUrl(initial ?? null);
      })();
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [linkingUrl]);

  useEffect(() => {
    if (recoveryUrl === undefined) return;

    if (!recoveryUrl) {
      setReady(false);
      setError(t('resetPassword.openLink'));
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
            err instanceof Error ? err.message : t('resetPassword.invalidLink'),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [recoveryUrl, t]);

  async function handleUpdatePassword() {
    const validationError = validatePassword(password);
    if (validationError) {
      setError(
        validationError === 'Use at least 8 characters.'
          ? t('auth.passwordMin')
          : validationError === 'Include at least one letter.'
            ? t('auth.passwordLetter')
            : t('auth.passwordNumber'),
      );
      return;
    }
    if (password !== confirmation) {
      setError(t('resetPassword.mismatch'));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.updateFailed'));
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
            {t('resetPassword.updatedTitle')}
          </Text>
          <Text className="mb-8 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            {t('resetPassword.updatedBody')}
          </Text>
          <Pressable
            className="w-full items-center rounded-full py-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.replace('/')}
          >
            <Text className="text-lg font-bold text-white">{t('recipe.goToLibrary')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ flexGrow: 1, paddingTop: 32, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
      <View
        className="mb-6 h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Ionicons name="lock-open-outline" size={24} color={colors.primary} />
      </View>
      <Text className="mb-2 text-2xl font-bold" style={{ color: colors.text }}>
        {t('resetPassword.chooseTitle')}
      </Text>
      <Text className="mb-6 text-sm leading-5" style={{ color: colors.textSecondary }}>
        {t('resetPassword.chooseHint')}
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
              placeholder={t('resetPassword.newPassword')}
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
              accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
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
              {t(`auth.strength.${strength}`)}
            </Text>
          </View>

          <TextInput
            className="mb-5 rounded-2xl border px-4 py-4 text-base"
            style={{
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
            placeholder={t('resetPassword.confirmPassword')}
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
            <Text className="text-lg font-bold text-white">{t('resetPassword.update')}</Text>
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
            {t('resetPassword.requestNewLink')}
          </Text>
        </Pressable>
      )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
