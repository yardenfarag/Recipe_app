import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openLegalDoc } from '@/components/LegalDocument';
import { FieldInput, TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PinchLogo } from '@/components/ui/PinchLogo';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useTileStyle } from '@/components/ui/Tile';
import { Radii } from '@/components/ui/tokens';
import { AuthCardWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useOnboarding } from '@/hooks/useOnboarding';
import { captureOnboardingCompleted } from '@/lib/analytics';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
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

/**
 * The page around sign-in (Night Market, PIN-177): flat on a phone, the form straight on the page; on a tablet or a
 * wide window, one tile in the middle, as on the web (web/components/AuthCard.tsx).
 */
function AuthShell({ children }: { children: ReactNode }) {
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const tile = useTileStyle('surface', 'lg');

  const keyboardSafeContent = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        {keyboardSafeContent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: colors.background,
      }}
      edges={['bottom', 'top']}
    >
      <View
        style={[
          tile,
          {
            width: '100%',
            maxWidth: AuthCardWidth,
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: 12,
            maxHeight: '100%',
          },
        ]}
      >
        {keyboardSafeContent}
      </View>
    </SafeAreaView>
  );
}

/** A failure under the form, read out as soon as it shows. */
function FormAlert({ message }: { message: string }) {
  const { colors } = useThemePreference();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        borderRadius: Radii.inner,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: colors.dangerSoft,
      }}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ paddingTop: 1 }}>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
      </View>
      <Text variant="bodySmall" tone="danger" weight="medium" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

/** The mail mark over "Check your email". */
function MailMark() {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 72,
        height: 72,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        marginBottom: 20,
      }}
    >
      <Ionicons name="mail-open-outline" size={32} color={colors.primaryText} />
    </View>
  );
}

/** The address the email went to: always left-to-right, as an address reads. */
function EmailEcho({ email }: { email: string }) {
  return (
    <Text weight="semibold" align="center" style={{ marginTop: 6, marginBottom: 24, writingDirection: 'ltr' }}>
      {email}
    </Text>
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
  const type = useTypography();
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
  /** The page's side padding: the tile pads itself on wider screens. */
  const pagePadding = isMediumUp ? 12 : 20;

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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: pagePadding, paddingVertical: 32 }}>
          <MailMark />
          <Text variant="h1" align="center">
            {t('auth.checkEmail')}
          </Text>
          <Text tone="muted" align="center" style={{ marginTop: 8 }}>
            {t(isReset ? 'auth.resetSent' : 'auth.codeSent')}
          </Text>
          <EmailEcho email={normalizeEmail(email)} />

          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <FieldInput
              accessibilityLabel={t('auth.codeLabel')}
              accessibilityHint={t(isReset ? 'auth.resetInstructions' : 'auth.codeInstructions')}
              invalid={Boolean(error)}
              containerStyle={{ minHeight: 68 }}
              style={{
                ...type.font('display', 'bold'),
                fontSize: 30,
                lineHeight: 36,
                textAlign: 'center',
                letterSpacing: 10,
                writingDirection: 'ltr',
              }}
              placeholder="••••••"
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
            <Text variant="bodySmall" tone="muted" align="center">
              {t(isReset ? 'auth.resetInstructions' : 'auth.codeInstructions')}
            </Text>

            {error ? <FormAlert message={error} /> : null}
            {notice && !error ? (
              <Text variant="bodySmall" tone="success" weight="semibold" align="center" accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}

            <Button
              size="lg"
              fullWidth
              trackId={isReset ? 'auth.reset_code.verify' : 'auth.code.verify'}
              onPress={() => void handleVerifyCode()}
              disabled={!codeComplete}
              busy={loading}
              style={{ marginTop: 8 }}
            >
              {t('auth.verifyCode')}
            </Button>
          </View>
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <Button
              variant="link"
              trackId={isReset ? 'auth.reset_code.resend' : 'auth.code.resend'}
              disabled={loading}
              onPress={() => void handleResendCode()}
            >
              {t('auth.resendCode')}
            </Button>
            <Pressable
              trackId={isReset ? 'auth.reset_code.change_email' : 'auth.code.change_email'}
              accessibilityRole="button"
              disabled={loading}
              onPress={() => {
                setWaitingFor(null);
                setCode('');
                setNotice(null);
                setError(null);
              }}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text variant="bodySmall" tone="muted" weight="medium">
                {t('auth.differentEmail')}
              </Text>
            </Pressable>
          </View>
        </View>
      </AuthShell>
    );
  }

  if (waitingFor) {
    const isConfirm = waitingFor === 'confirm';
    return (
      <AuthShell>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: pagePadding, paddingVertical: 32 }}>
          <MailMark />
          <Text variant="h1" align="center">
            {t('auth.checkEmail')}
          </Text>
          <Text tone="muted" align="center" style={{ marginTop: 8 }}>
            {t(isConfirm ? 'auth.confirmSent' : 'auth.resetSent')}
          </Text>
          <EmailEcho email={normalizeEmail(email)} />
          <Text variant="bodySmall" tone="muted" align="center" style={{ marginBottom: 28 }}>
            {t(isConfirm ? 'auth.confirmInstructions' : 'auth.resetInstructions')}
          </Text>
          <Button size="lg" fullWidth trackId="auth.check_email.sign_in" onPress={() => switchMode('signin')}>
            {t(isConfirm ? 'auth.confirmedSignIn' : 'auth.backToSignIn')}
          </Button>
          <Button
            variant="link"
            trackId="auth.check_email.change_email"
            style={{ marginTop: 12, alignSelf: 'center' }}
            onPress={() => {
              setWaitingFor(null);
              if (isConfirm) setMode('signup');
              else setMode('forgot');
            }}
          >
            {t(isConfirm ? 'auth.differentEmail' : 'auth.resendOrEdit')}
          </Button>
        </View>
      </AuthShell>
    );
  }

  const submitLabel =
    mode === 'signup'
      ? t('auth.signUp')
      : mode === 'forgot'
        ? t('auth.sendResetLink')
        : mode === 'code'
          ? t('auth.sendCode')
          : t('auth.signIn');

  return (
    <AuthShell>
      <View style={{ flex: 1, paddingHorizontal: pagePadding, paddingTop: 28, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <PinchLogo style={{ marginBottom: 24 }} />
          <Text variant="h1" align="center">
            {mode === 'signup'
              ? t('auth.createAccount')
              : mode === 'forgot'
                ? t('auth.resetPassword')
                : mode === 'code'
                  ? t('auth.codeTitle')
                  : t('auth.welcomeBack')}
          </Text>
          <Text tone="muted" align="center" style={{ marginTop: 8 }}>
            {subtitle}
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <TextField
            label={t('auth.email')}
            leading={<Ionicons name="mail-outline" size={18} color={colors.textSecondary} />}
            placeholder={t('auth.emailPlaceholder')}
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
            editable={!loading}
            onSubmitEditing={() => {
              logTap('auth.email_field.submit_key', { mode });
              if (!usesPassword && canSubmit) void handleEmail();
            }}
          />

          {usesPassword ? (
            <View style={{ gap: 8 }}>
              <TextField
                label={t('auth.password')}
                accessibilityHint={mode === 'signup' ? t('auth.passwordHint') : undefined}
                leading={<Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />}
                trailing={
                  <IconButton
                    icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    iconSize={20}
                    label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                    trackId="auth.password.toggle_visibility"
                    onPress={() => setShowPassword((value) => !value)}
                    disabled={loading}
                  />
                }
                placeholder="••••••••"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (error) setError(null);
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                editable={!loading}
                onSubmitEditing={() => {
                  logTap('auth.password_field.submit_key', { mode });
                  if (canSubmit) void handleEmail();
                }}
              />

              {mode === 'signup' ? (
                <View style={{ gap: 6 }}>
                  <View
                    style={{ flexDirection: 'row', gap: 6 }}
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    {(['weak', 'good', 'strong'] as const).map((level, index) => {
                      const activeCount =
                        passwordStrength === 'strong' ? 3 : passwordStrength === 'good' ? 2 : 1;
                      const barColor =
                        password && index < activeCount
                          ? passwordStrength === 'strong'
                            ? colors.success
                            : passwordStrength === 'good'
                              ? colors.warning
                              : colors.danger
                          : colors.backgroundSelected;
                      return (
                        <View
                          key={level}
                          style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: barColor }}
                        />
                      );
                    })}
                  </View>
                  <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                    {password ? t(`auth.strength.${passwordStrength}`) : t('auth.passwordHint')}
                  </Text>
                </View>
              ) : null}

              {mode === 'signin' ? (
                <Button
                  variant="link"
                  trackId="auth.forgot_password"
                  onPress={() => switchMode('forgot')}
                  disabled={loading}
                  style={{ alignSelf: 'flex-end', marginTop: -6 }}
                >
                  {t('auth.forgotPassword')}
                </Button>
              ) : null}
            </View>
          ) : null}

          {error ? <FormAlert message={error} /> : null}

          <Button
            size="lg"
            fullWidth
            trackId="auth.email.submit"
            onPress={handleEmail}
            disabled={!canSubmit && !loading}
            busy={loading}
            accessibilityLabel={submitLabel}
            style={{ marginTop: 4 }}
          >
            {submitLabel}
          </Button>

          {mode === 'signin' ? (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon="keypad-outline"
              trackId="auth.switch_to_code"
              onPress={() => switchMode('code')}
              disabled={loading}
            >
              {t('auth.emailMeCode')}
            </Button>
          ) : null}
        </View>

        <Button
          variant="link"
          trackId={mode === 'signin' ? 'auth.switch_to_signup' : 'auth.switch_to_signin'}
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={loading}
          style={{ alignSelf: 'center', marginTop: 12 }}
        >
          {mode === 'signup'
            ? t('auth.haveAccount')
            : mode === 'forgot'
              ? t('auth.backToSignIn')
              : mode === 'code'
                ? t('auth.usePassword')
                : t('auth.needAccount')}
        </Button>

        {usesPassword ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text variant="caption" tone="muted">
              {t('auth.orContinueWith')}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
        ) : null}

        {usesPassword && isAppleAvailable ? (
          <View pointerEvents={loading ? 'none' : 'auto'} style={{ opacity: loading ? 0.5 : 1, marginBottom: 12 }}>
            {/* Apple's own button, as its rules require: white with an outline on a light page, white on a dark one. */}
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                mode === 'signup'
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
              }
              cornerRadius={16}
              style={{ width: '100%', height: 56 }}
              onPress={handleApple}
            />
          </View>
        ) : null}

        {usesPassword ? (
          <Button variant="outline" size="lg" fullWidth trackId="auth.google" onPress={handleGoogle} disabled={loading}>
            {t('auth.continueGoogle')}
          </Button>
        ) : null}

        <View
          style={{
            marginTop: 28,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            columnGap: 4,
          }}
        >
          <Pressable
            trackId="auth.legal.privacy"
            onPress={() => openLegalDoc('privacy')}
            disabled={loading}
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text variant="caption" tone="muted" weight="medium">
              {t('auth.privacy')}
            </Text>
          </Pressable>
          <Text variant="caption" tone="muted" accessible={false} importantForAccessibility="no">
            ·
          </Text>
          <Pressable
            trackId="auth.legal.terms"
            onPress={() => openLegalDoc('terms')}
            disabled={loading}
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text variant="caption" tone="muted" weight="medium">
              {t('auth.terms')}
            </Text>
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
