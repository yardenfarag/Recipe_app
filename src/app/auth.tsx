import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

import { CookieMark } from '@/components/CookieMark';
import { AuthCardWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  getPasswordStrength,
  isValidEmail,
  normalizeEmail,
  validatePassword,
} from '@/lib/authValidation';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';
import {
  isAppleAuthAvailable,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/supabase/auth';

type Mode = 'signin' | 'signup' | 'forgot';
type WaitingFor = 'confirm' | 'reset' | null;
type AuthReason = 'extract_limit' | 'save_limit' | 'sync' | 'shared_recipe' | undefined;

function parseMode(value: string | string[] | undefined): Mode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'signin' || raw === 'forgot' ? raw : 'signup';
}

function parseReason(value: string | string[] | undefined): AuthReason {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === 'extract_limit' ||
    raw === 'save_limit' ||
    raw === 'sync' ||
    raw === 'shared_recipe'
  ) {
    return raw;
  }
  return undefined;
}

function AuthShell({ children }: { children: ReactNode }) {
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();

  const keyboardSafeContent = (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (!isMediumUp) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={['bottom']}>
        {keyboardSafeContent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: colors.background }}
      edges={['bottom', 'top']}
    >
      <View
        style={{
          width: '100%',
          maxWidth: AuthCardWidth,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
          backgroundColor: colors.surface,
          paddingHorizontal: 24,
          paddingTop: 28,
          paddingBottom: 24,
          maxHeight: '100%',
        }}
      >
        {keyboardSafeContent}
      </View>
    </SafeAreaView>
  );
}

export default function AuthScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; reason?: string }>();
  const initialMode = useMemo(() => parseMode(params.mode), [params.mode]);
  const reason = useMemo(() => parseReason(params.reason), [params.reason]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [waitingFor, setWaitingFor] = useState<WaitingFor>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors, scheme } = useThemePreference();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    isAppleAuthAvailable().then(setIsAppleAvailable);
  }, []);

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function switchMode(next: Mode) {
    setMode(next);
    setWaitingFor(null);
    setPassword('');
    setShowPassword(false);
    setError(null);
  }

  async function handleEmail() {
    setError(null);
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setError(t('auth.validEmail'));
      return;
    }
    if (mode !== 'forgot' && !password) {
      setError(t('auth.enterPassword'));
      return;
    }
    if (mode === 'signup') {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(
          passwordError === 'Use at least 8 characters.'
            ? t('auth.passwordMin')
            : passwordError === 'Include at least one letter.'
              ? t('auth.passwordLetter')
              : t('auth.passwordNumber'),
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithEmail(normalizedEmail, password);
        if (needsConfirmation) {
          setPassword('');
          setWaitingFor('confirm');
          return;
        }
      } else if (mode === 'signin') {
        await signInWithEmail(normalizedEmail, password);
      } else {
        await requestPasswordReset(normalizedEmail);
        setWaitingFor('reset');
        return;
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.genericError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    setLoading(true);
    try {
      await signInWithApple();
      done();
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : t('auth.appleFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.cancelled) done();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  }

  const passwordStrength = getPasswordStrength(password);
  const canSubmit =
    Boolean(email.trim()) && (mode === 'forgot' || Boolean(password)) && !loading;
  const { isMediumUp } = useBreakpoint();

  const subtitle =
    reason === 'extract_limit'
      ? t('auth.reasonExtract')
      : reason === 'save_limit'
        ? t('auth.reasonSave')
        : reason === 'sync'
          ? t('auth.reasonSync')
          : reason === 'shared_recipe'
            ? t('auth.reasonShared')
            : mode === 'signup'
              ? t('auth.signupSubtitle')
              : mode === 'forgot'
                ? t('auth.forgotSubtitle')
                : t('auth.signinSubtitle');

  if (waitingFor) {
    const isConfirm = waitingFor === 'confirm';
    return (
      <AuthShell>
        <View className="flex-1 items-center justify-center px-6 pb-10">
          <View
            className="mb-5 h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="mail-open-outline" size={30} color={colors.primary} />
          </View>
          <Text className="mb-2 text-center text-2xl font-bold" style={{ color: colors.text }}>
            {t('auth.checkEmail')}
          </Text>
          <Text className="mb-2 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            {t(isConfirm ? 'auth.confirmSent' : 'auth.resetSent')}
          </Text>
          <Text className="mb-6 text-center text-base font-semibold" style={{ color: colors.text }}>
            {normalizeEmail(email)}
          </Text>
          <Text className="mb-8 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
            {t(isConfirm ? 'auth.confirmInstructions' : 'auth.resetInstructions')}
          </Text>
          <Pressable
            className="mb-3 w-full items-center rounded-full py-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => switchMode('signin')}
          >
            <Text className="text-lg font-bold text-white">
              {t(isConfirm ? 'auth.confirmedSignIn' : 'auth.backToSignIn')}
            </Text>
          </Pressable>
          <Pressable
            className="items-center py-3"
            onPress={() => {
              setWaitingFor(null);
              if (isConfirm) setMode('signup');
              else setMode('forgot');
            }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {t(isConfirm ? 'auth.differentEmail' : 'auth.resendOrEdit')}
            </Text>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <View className="flex-1 px-6 pt-4" style={isMediumUp ? { paddingHorizontal: 0, paddingTop: 0 } : undefined}>
        <View className="mb-6">
          <View
            className="mb-3 h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <CookieMark size={26} color={colors.primary} />
          </View>
          <Text className="mb-1 text-2xl font-bold" style={{ color: colors.text }}>
            {mode === 'signup'
              ? t('auth.createAccount')
              : mode === 'forgot'
                ? t('auth.resetPassword')
                : t('auth.welcomeBack')}
          </Text>
          <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
            {subtitle}
          </Text>
        </View>

        <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
          {t('auth.email')}
        </Text>
        <View
          className="mb-4 h-14 flex-row items-center rounded-2xl border px-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
          <TextInput
            className="flex-1 px-3 text-base"
            style={{ color: colors.text, paddingVertical: 0 }}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            textAlignVertical="center"
            editable={!loading}
            onSubmitEditing={() => {
              if (mode === 'forgot' && canSubmit) void handleEmail();
            }}
          />
        </View>

        {mode !== 'forgot' && (
          <>
            <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
              {t('auth.password')}
            </Text>
            <View
              className="h-14 flex-row items-center rounded-2xl border px-3.5"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
              <TextInput
                className="flex-1 px-3 text-base"
                style={{ color: colors.text, paddingVertical: 0 }}
                placeholder="••••••••"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (error) setError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                textAlignVertical="center"
                editable={!loading}
                onSubmitEditing={() => {
                  if (canSubmit) void handleEmail();
                }}
              />
              <Pressable
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            {mode === 'signup' && (
              <View className="mb-5 mt-2">
                <View className="mb-1.5 flex-row gap-1.5">
                  {(['weak', 'good', 'strong'] as const).map((level, index) => {
                    const activeCount =
                      passwordStrength === 'strong' ? 3 : passwordStrength === 'good' ? 2 : 1;
                    const barColor =
                      index < activeCount
                        ? passwordStrength === 'strong'
                          ? colors.success
                          : passwordStrength === 'good'
                            ? colors.warning
                            : colors.danger
                        : colors.border;
                    return (
                      <View
                        key={level}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ backgroundColor: barColor }}
                      />
                    );
                  })}
                </View>
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  {password
                    ? t(`auth.strength.${passwordStrength}`)
                    : t('auth.passwordHint')}
                </Text>
              </View>
            )}

            {mode === 'signin' && (
              <Pressable
                className="mb-5 mt-2 self-end py-1"
                onPress={() => switchMode('forgot')}
                disabled={loading}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                  {t('auth.forgotPassword')}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {mode === 'forgot' && <View className="mb-5" />}

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

        <Pressable
          className="items-center rounded-full py-4"
          style={{ backgroundColor: canSubmit ? colors.primary : colors.border }}
          onPress={handleEmail}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-lg font-bold text-white">
              {mode === 'signup'
                ? t('auth.signUp')
                : mode === 'forgot'
                  ? t('auth.sendResetLink')
                  : t('auth.signIn')}
            </Text>
          )}
        </Pressable>

        <Pressable
          className="items-center py-4"
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={loading}
        >
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
            {mode === 'signup'
              ? t('auth.haveAccount')
              : mode === 'forgot'
                ? t('auth.backToSignIn')
                : t('auth.needAccount')}
          </Text>
        </Pressable>

        {mode !== 'forgot' && (
          <View className="my-2 flex-row items-center">
            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
            <Text className="mx-3 text-xs" style={{ color: colors.textSecondary }}>
              {t('auth.orContinueWith')}
            </Text>
            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
          </View>
        )}

        {mode !== 'forgot' && isAppleAvailable && (
          <View pointerEvents={loading ? 'none' : 'auto'} style={{ opacity: loading ? 0.5 : 1 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                mode === 'signup'
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={999}
              style={{ width: '100%', height: 52, marginBottom: 12, marginTop: 8 }}
              onPress={handleApple}
            />
          </View>
        )}

        {mode !== 'forgot' && (
          <Pressable
            className="mt-1 flex-row items-center justify-center rounded-full border py-4"
            onPress={handleGoogle}
            disabled={loading}
            style={{
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <Text className="text-base font-semibold" style={{ color: colors.text }}>
              {t('auth.continueGoogle')}
            </Text>
          </Pressable>
        )}

        <View className="mt-6 flex-row flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <Pressable onPress={() => void openLegalUrl(LEGAL_URLS.privacy)} disabled={loading}>
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {t('auth.privacy')}
            </Text>
          </Pressable>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            ·
          </Text>
          <Pressable onPress={() => void openLegalUrl(LEGAL_URLS.terms)} disabled={loading}>
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {t('auth.terms')}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
