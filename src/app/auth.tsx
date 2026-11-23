import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CookieMark } from '@/components/CookieMark';
import { openLegalDoc } from '@/components/LegalDocument';
import { TextInput } from '@/components/text-input';
import { AuthCardWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useOnboarding } from '@/hooks/useOnboarding';
import { captureOnboardingCompleted } from '@/lib/analytics';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import {
  getPasswordStrength,
  isValidEmail,
  normalizeEmail,
  validatePassword,
} from '@shared/lib/authValidation';
import { safeReturnPath } from '@/lib/authReturnPath';
import { savePendingOAuthReason, savePendingOAuthReturnTo } from '@/lib/pendingOAuth';
import { logTap } from '@/lib/interactionLog';
import { authErrorText } from '@shared/lib/serverErrors';
import {
  isAppleAuthAvailable,
  requestPasswordReset,
  sendSignInCode,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  verifyResetCode,
  verifySignInCode,
} from '@/lib/supabase/auth';

/** 'code' signs in with a 6-digit emailed code instead of a password. */
type Mode = 'signin' | 'signup' | 'forgot' | 'code';
type WaitingFor = 'confirm' | 'reset' | 'code' | null;

const CODE_LENGTH = 6;
type AuthReason =
  | 'extract_limit'
  | 'save_limit'
  | 'sync'
  | 'shared_recipe'
  | 'hub_recipe'
  | 'onboarding'
  | 'edit'
  | undefined;

function parseMode(value: string | string[] | undefined): Mode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'signin' || raw === 'forgot' || raw === 'code' ? raw : 'signup';
}

function parseReason(value: string | string[] | undefined): AuthReason {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === 'extract_limit' ||
    raw === 'save_limit' ||
    raw === 'sync' ||
    raw === 'shared_recipe' ||
    raw === 'hub_recipe' ||
    raw === 'onboarding' ||
    raw === 'edit'
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
  const params = useLocalSearchParams<{ mode?: string; reason?: string; returnTo?: string }>();
  const initialMode = useMemo(() => parseMode(params.mode), [params.mode]);
  const reason = useMemo(() => parseReason(params.reason), [params.reason]);
  const returnTo = useMemo(() => safeReturnPath(params.returnTo), [params.returnTo]);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [waitingFor, setWaitingFor] = useState<WaitingFor>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors, scheme } = useThemePreference();
  const { completed: onboardingCompleted, completeOnboarding } = useOnboarding();
  const { language } = useLanguagePreference();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    isAppleAuthAvailable().then(setIsAppleAvailable);
  }, []);

  useEffect(() => {
    if (error) announce(error);
  }, [error]);

  useEffect(() => {
    if (waitingFor) announce(t('auth.checkEmail'));
  }, [waitingFor, t]);

  async function done() {
    if (reason === 'onboarding') {
      captureOnboardingCompleted({ locale: language, platform: Platform.OS });
      await completeOnboarding();
      // New accounts pick their first recipes from the Hub; one with recipes already goes on to Snap.
      router.dismissTo('/first-recipes');
      return;
    }
    if (returnTo) {
      // They came from a shared or Hub recipe and skipped onboarding: don't send them to it now.
      if (!onboardingCompleted) await completeOnboarding();
      // The recipe screen is still underneath and saves on return; if not, open it to save.
      if (router.canGoBack()) router.back();
      else router.replace(returnTo);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.dismissTo('/');
  }

  function switchMode(next: Mode) {
    setMode(next);
    setWaitingFor(null);
    setPassword('');
    setShowPassword(false);
    setCode('');
    setNotice(null);
    setError(null);
  }

  /** Signing in or up with a password; the code and forgot modes only ask for the email. */
  const usesPassword = mode === 'signin' || mode === 'signup';

  async function sendCodeEmail(target: 'code' | 'reset', address: string) {
    if (target === 'code') await sendSignInCode(address, language);
    else await requestPasswordReset(address);
  }

  async function handleResendCode() {
    if (waitingFor !== 'code' && waitingFor !== 'reset') return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await sendCodeEmail(waitingFor, normalizeEmail(email));
      setCode('');
      setNotice(t('auth.codeResent'));
    } catch (err) {
      setError(authErrorText(err, t, 'auth.genericError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(value = code) {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== CODE_LENGTH || loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (waitingFor === 'reset') {
        await verifyResetCode(normalizeEmail(email), digits);
        router.replace('/reset-password?via=code');
        return;
      }
      await verifySignInCode(normalizeEmail(email), digits);
      done();
    } catch (err) {
      setError(authErrorText(err, t, 'auth.genericError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail() {
    setError(null);
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      setError(t('auth.validEmail'));
      return;
    }
    if (usesPassword && !password) {
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
        const { needsConfirmation } = await signUpWithEmail(normalizedEmail, password, language);
        if (needsConfirmation) {
          setPassword('');
          setWaitingFor('confirm');
          return;
        }
      } else if (mode === 'signin') {
        await signInWithEmail(normalizedEmail, password);
      } else {
        const target = mode === 'code' ? 'code' : 'reset';
        await sendCodeEmail(target, normalizedEmail);
        setCode('');
        setNotice(null);
        setWaitingFor(target);
        return;
      }
      done();
    } catch (err) {
      setError(authErrorText(err, t, 'auth.genericError'));
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
      setError(authErrorText(err, t, 'auth.appleFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        savePendingOAuthReason(reason);
        savePendingOAuthReturnTo(returnTo);
      }
      const result = await signInWithGoogle();
      if (!result.cancelled) done();
    } catch (err) {
      setError(authErrorText(err, t, 'auth.googleFailed'));
    } finally {
      setLoading(false);
    }
  }

  const passwordStrength = getPasswordStrength(password);
  const canSubmit = Boolean(email.trim()) && (!usesPassword || Boolean(password)) && !loading;
  const { isMediumUp } = useBreakpoint();

  const subtitle =
    reason === 'extract_limit'
      ? t('auth.reasonExtract')
      : reason === 'save_limit'
        ? t('auth.reasonSave')
        : reason === 'sync'
          ? t('auth.reasonSync')
          :     reason === 'shared_recipe'
            ? t('auth.reasonShared')
            : reason === 'hub_recipe'
              ? t('auth.reasonHub')
            : reason === 'onboarding' && mode === 'signup'
              ? t('auth.reasonOnboarding')
            : reason === 'edit'
              ? t('auth.reasonEdit')
              : mode === 'signup'
              ? t('auth.signupSubtitle')
              : mode === 'forgot'
                ? t('auth.forgotSubtitle')
                : mode === 'code'
                  ? t('auth.codeSubtitle')
                  : t('auth.signinSubtitle');

  if (waitingFor === 'code' || waitingFor === 'reset') {
    const isReset = waitingFor === 'reset';
    const codeComplete = code.length === CODE_LENGTH;
    return (
      <AuthShell>
        <View className="flex-1 items-center justify-center px-6 pb-10">
          <View
            className="mb-5 h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.primarySoft }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="mail-open-outline" size={30} color={colors.primary} />
          </View>
          <Text
            className="mb-2 text-center text-2xl font-bold"
            style={{ color: colors.text }}
            accessibilityRole="header"
          >
            {t('auth.checkEmail')}
          </Text>
          <Text className="mb-2 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            {t(isReset ? 'auth.resetSent' : 'auth.codeSent')}
          </Text>
          <Text className="mb-6 text-center text-base font-semibold" style={{ color: colors.text }}>
            {normalizeEmail(email)}
          </Text>

          <TextInput
            accessibilityLabel={t('auth.codeLabel')}
            accessibilityHint={t(isReset ? 'auth.resetInstructions' : 'auth.codeInstructions')}
            className="mb-3 w-full rounded-2xl border px-4 py-4 text-center text-3xl font-bold"
            style={{
              color: colors.text,
              borderColor: error ? colors.danger : colors.border,
              backgroundColor: colors.surface,
              letterSpacing: 10,
              writingDirection: 'ltr',
            }}
            placeholder="••••••"
            placeholderTextColor={colors.textSecondary}
            value={code}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
              setCode(digits);
              if (error) setError(null);
              // Pasted or autofilled codes sign in right away.
              if (digits.length === CODE_LENGTH) void handleVerifyCode(digits);
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH}
            autoFocus
            editable={!loading}
            onSubmitEditing={() => {
              logTap('auth.code_field.submit_key', { mode: waitingFor });
              void handleVerifyCode();
            }}
          />
          <Text className="mb-5 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
            {t(isReset ? 'auth.resetInstructions' : 'auth.codeInstructions')}
          </Text>

          {error && (
            <View
              className="mb-4 w-full rounded-2xl border px-4 py-3"
              style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
              accessibilityRole="alert"
            >
              <Text className="text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            </View>
          )}
          {notice && !error && (
            <Text
              className="mb-4 text-center text-sm font-semibold"
              style={{ color: colors.success }}
              accessibilityLiveRegion="polite"
            >
              {notice}
            </Text>
          )}

          <Pressable trackId={isReset ? 'auth.reset_code.verify' : 'auth.code.verify'}
            className="mb-3 w-full items-center rounded-full py-4"
            style={{ backgroundColor: codeComplete && !loading ? colors.primary : colors.border }}
            onPress={() => void handleVerifyCode()}
            disabled={!codeComplete || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !codeComplete || loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={codeComplete ? colors.onPrimary : colors.textSecondary} />
            ) : (
              <Text
                className="text-lg font-bold"
                style={{ color: codeComplete ? colors.onPrimary : colors.textSecondary }}
              >
                {t('auth.verifyCode')}
              </Text>
            )}
          </Pressable>
          <Pressable trackId={isReset ? 'auth.reset_code.resend' : 'auth.code.resend'}
            className="items-center py-3"
            accessibilityRole="button"
            disabled={loading}
            onPress={() => void handleResendCode()}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {t('auth.resendCode')}
            </Text>
          </Pressable>
          <Pressable trackId={isReset ? 'auth.reset_code.change_email' : 'auth.code.change_email'}
            className="items-center py-2"
            accessibilityRole="button"
            disabled={loading}
            onPress={() => {
              setWaitingFor(null);
              setCode('');
              setNotice(null);
              setError(null);
            }}
          >
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('auth.differentEmail')}
            </Text>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  if (waitingFor) {
    const isConfirm = waitingFor === 'confirm';
    return (
      <AuthShell>
        <View className="flex-1 items-center justify-center px-6 pb-10">
          <View
            className="mb-5 h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.primarySoft }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="mail-open-outline" size={30} color={colors.primary} />
          </View>
          <Text
            className="mb-2 text-center text-2xl font-bold"
            style={{ color: colors.text }}
            accessibilityRole="header"
          >
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
          <Pressable trackId="auth.check_email.sign_in"
            className="mb-3 w-full items-center rounded-full py-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => switchMode('signin')}
            accessibilityRole="button"
          >
            <Text className="text-lg font-bold" style={{ color: colors.onPrimary }}>
              {t(isConfirm ? 'auth.confirmedSignIn' : 'auth.backToSignIn')}
            </Text>
          </Pressable>
          <Pressable trackId="auth.check_email.change_email"
            className="items-center py-3"
            accessibilityRole="button"
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
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <CookieMark size={26} color={colors.primary} />
          </View>
          <Text
            className="mb-1 text-2xl font-bold"
            style={{ color: colors.text }}
            accessibilityRole="header"
          >
            {mode === 'signup'
              ? t('auth.createAccount')
              : mode === 'forgot'
                ? t('auth.resetPassword')
                : mode === 'code'
                  ? t('auth.codeTitle')
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
          className="mb-4 min-h-14 flex-row items-center rounded-2xl border px-3.5"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
          </View>
          <TextInput
            accessibilityLabel={t('auth.email')}
            className="flex-1 px-3 text-base"
            style={{ color: colors.text, paddingVertical: 0 }}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            onBlur={() => {
              const normalized = normalizeEmail(email);
              if (!normalized) return;
              if (!isValidEmail(normalized)) {
                setError(t('auth.validEmail'));
                return;
              }
              if (error === t('auth.validEmail')) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            textAlignVertical="center"
            editable={!loading}
            onSubmitEditing={() => {
              logTap('auth.email_field.submit_key', { mode });
              if (!usesPassword && canSubmit) void handleEmail();
            }}
          />
        </View>

        {usesPassword && (
          <>
            <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
              {t('auth.password')}
            </Text>
            <View
              className="min-h-14 flex-row items-center rounded-2xl border px-3.5"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <View accessible={false} importantForAccessibility="no-hide-descendants">
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
              </View>
              <TextInput
                accessibilityLabel={t('auth.password')}
                accessibilityHint={mode === 'signup' ? t('auth.passwordHint') : undefined}
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
                  logTap('auth.password_field.submit_key', { mode });
                  if (canSubmit) void handleEmail();
                }}
              />
              <Pressable trackId="auth.password.toggle_visibility"
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                accessibilityState={{ disabled: loading }}
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
                <View
                  className="mb-1.5 flex-row gap-1.5"
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                >
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
                <Text
                  className="text-xs"
                  style={{ color: colors.textSecondary }}
                  accessibilityLiveRegion="polite"
                >
                  {password
                    ? t(`auth.strength.${passwordStrength}`)
                    : t('auth.passwordHint')}
                </Text>
              </View>
            )}

            {mode === 'signin' && (
              <Pressable trackId="auth.forgot_password"
                className="mb-5 mt-2 self-end py-1"
                onPress={() => switchMode('forgot')}
                disabled={loading}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading }}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                  {t('auth.forgotPassword')}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {!usesPassword && <View className="mb-5" />}

        {error && (
          <View
            className="mb-5 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
            accessibilityRole="alert"
          >
            <Text className="text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        )}

        <Pressable trackId="auth.email.submit"
          className="items-center rounded-full py-4"
          style={{ backgroundColor: canSubmit ? colors.primary : colors.border }}
          onPress={handleEmail}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={
            mode === 'signup'
              ? t('auth.signUp')
              : mode === 'forgot'
                ? t('auth.sendResetLink')
                : mode === 'code'
                  ? t('auth.sendCode')
                  : t('auth.signIn')
          }
          accessibilityState={{ disabled: !canSubmit, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color={canSubmit ? colors.onPrimary : colors.textSecondary} />
          ) : (
            <Text
              className="text-lg font-bold"
              style={{ color: canSubmit ? colors.onPrimary : colors.textSecondary }}
            >
              {mode === 'signup'
                ? t('auth.signUp')
                : mode === 'forgot'
                  ? t('auth.sendResetLink')
                  : mode === 'code'
                    ? t('auth.sendCode')
                    : t('auth.signIn')}
            </Text>
          )}
        </Pressable>

        {mode === 'signin' && (
          <Pressable trackId="auth.switch_to_code"
            className="mt-3 flex-row items-center justify-center rounded-full border py-3.5"
            style={{ borderColor: colors.border }}
            onPress={() => switchMode('code')}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
          >
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <Ionicons name="keypad-outline" size={18} color={colors.primary} />
            </View>
            <Text className="text-sm font-semibold" style={{ color: colors.primary, marginStart: 8 }}>
              {t('auth.emailMeCode')}
            </Text>
          </Pressable>
        )}

        <Pressable trackId={mode === 'signin' ? 'auth.switch_to_signup' : 'auth.switch_to_signin'}
          className="items-center py-4"
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={loading}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
            {mode === 'signup'
              ? t('auth.haveAccount')
              : mode === 'forgot'
                ? t('auth.backToSignIn')
                : mode === 'code'
                  ? t('auth.usePassword')
                  : t('auth.needAccount')}
          </Text>
        </Pressable>

        {usesPassword && (
          <View className="my-2 flex-row items-center">
            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
            <Text className="mx-3 text-xs" style={{ color: colors.textSecondary }}>
              {t('auth.orContinueWith')}
            </Text>
            <View className="h-px flex-1" style={{ backgroundColor: colors.border }} />
          </View>
        )}

        {usesPassword && isAppleAvailable && (
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

        {usesPassword && (
          <Pressable trackId="auth.google"
            className="mt-1 flex-row items-center justify-center rounded-full border py-4"
            onPress={handleGoogle}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
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
          <Pressable trackId="auth.legal.privacy"
            onPress={() => openLegalDoc('privacy')}
            disabled={loading}
            hitSlop={12}
            accessibilityRole="link"
          >
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {t('auth.privacy')}
            </Text>
          </Pressable>
          <Text
            className="text-xs"
            style={{ color: colors.textSecondary }}
            accessible={false}
            importantForAccessibility="no"
          >
            ·
          </Text>
          <Pressable trackId="auth.legal.terms"
            onPress={() => openLegalDoc('terms')}
            disabled={loading}
            hitSlop={12}
            accessibilityRole="link"
          >
            <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
              {t('auth.terms')}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
