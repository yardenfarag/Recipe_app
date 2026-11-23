import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { getPasswordStrength, validatePassword } from '@shared/lib/authValidation';
import { logTap } from '@/lib/interactionLog';
import { authErrorText } from '@shared/lib/serverErrors';
import { consumePasswordRecoveryUrl, hasSession, updatePassword } from '@/lib/supabase/auth';

/** The round-cornered mark over the screen's heading. */
function HeadingMark({ icon }: { icon: 'checkmark-circle-outline' | 'lock-open-outline' }) {
  const { colors } = useThemePreference();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 64,
        height: 64,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        marginBottom: 20,
      }}
    >
      <Ionicons name={icon} size={30} color={colors.primaryText} />
    </View>
  );
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const linkingUrl = Linking.useLinkingURL();
  // ?via=code: the auth screen already signed in with the code from the reset email.
  const viaCode = useLocalSearchParams<{ via?: string }>().via === 'code';
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
    if (!viaCode) return;
    let active = true;
    void hasSession().then((signedIn) => {
      if (!active) return;
      setReady(signedIn);
      setError(signedIn ? null : t('resetPassword.openLink'));
    });
    return () => {
      active = false;
    };
  }, [viaCode, t]);

  useEffect(() => {
    if (viaCode) return;
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
  }, [linkingUrl, viaCode]);

  useEffect(() => {
    if (viaCode || recoveryUrl === undefined) return;

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
          setError(authErrorText(err, t, 'resetPassword.invalidLink'));
        }
      });

    return () => {
      active = false;
    };
  }, [recoveryUrl, viaCode, t]);

  useEffect(() => {
    if (error) announce(error);
  }, [error]);

  useEffect(() => {
    if (done) announce(t('resetPassword.updatedTitle'));
  }, [done, t]);

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
      setError(authErrorText(err, t, 'resetPassword.updateFailed'));
    } finally {
      setLoading(false);
    }
  }

  const strength = getPasswordStrength(password);
  const canSubmit = ready && Boolean(password && confirmation) && !loading;


  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 20, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 }}>
          <HeadingMark icon="checkmark-circle-outline" />
          <Text variant="h1" align="center">
            {t('resetPassword.updatedTitle')}
          </Text>
          <Text tone="muted" align="center" style={{ marginTop: 8, marginBottom: 32 }}>
            {t('resetPassword.updatedBody')}
          </Text>
          <Button size="lg" fullWidth trackId="reset_password.done.continue" onPress={() => router.dismissTo('/')}>
            {t('recipe.goToLibrary')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <HeadingMark icon="lock-open-outline" />
          <Text variant="h1">{t('resetPassword.chooseTitle')}</Text>
          <Text tone="muted" style={{ marginTop: 8, marginBottom: 24 }}>
            {t('resetPassword.chooseHint')}
          </Text>

          {!ready && !error ? (
            <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
          ) : null}

          <View style={{ gap: 16 }}>
            {ready ? (
              <>
                <View style={{ gap: 8 }}>
                  <TextField
                    label={t('resetPassword.newPassword')}
                    accessibilityHint={t('resetPassword.chooseHint')}
                    trailing={
                      <IconButton
                        icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        iconSize={20}
                        label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                        trackId="reset_password.password.toggle_visibility"
                        onPress={() => setShowPassword((value) => !value)}
                      />
                    }
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
                  <View style={{ gap: 6 }}>
                    <View
                      style={{ flexDirection: 'row', gap: 6 }}
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                    >
                      {[0, 1, 2].map((index) => {
                        const activeCount = strength === 'strong' ? 3 : strength === 'good' ? 2 : 1;
                        const barColor =
                          password && index < activeCount
                            ? strength === 'strong'
                              ? colors.success
                              : strength === 'good'
                                ? colors.warning
                                : colors.danger
                            : colors.backgroundSelected;
                        return (
                          <View key={index} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: barColor }} />
                        );
                      })}
                    </View>
                    <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                      {t(`auth.strength.${strength}`)}
                    </Text>
                  </View>
                </View>

                <TextField
                  label={t('resetPassword.confirmPassword')}
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
                    logTap('reset_password.confirm_field.submit_key');
                    if (canSubmit) void handleUpdatePassword();
                  }}
                />
              </>
            ) : null}

            {error ? (
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
                  {error}
                </Text>
              </View>
            ) : null}

            {ready ? (
              <Button
                size="lg"
                fullWidth
                trackId="reset_password.submit"
                onPress={handleUpdatePassword}
                disabled={!canSubmit && !loading}
                busy={loading}
                accessibilityLabel={t('resetPassword.update')}
                style={{ marginTop: 4 }}
              >
                {t('resetPassword.update')}
              </Button>
            ) : null}

            {error && !ready ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                trackId="reset_password.request_new_link"
                onPress={() => router.replace('/auth?mode=forgot')}
              >
                {t('resetPassword.requestNewLink')}
              </Button>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
