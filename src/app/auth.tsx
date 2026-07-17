import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  isAppleAuthAvailable,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/supabase/auth';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors, scheme } = useThemePreference();

  useEffect(() => {
    isAppleAuthAvailable().then(setIsAppleAvailable);
  }, []);

  function done() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function handleEmail() {
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithEmail(email.trim(), password);
        if (needsConfirmation) {
          Alert.alert(
            'Confirm your email',
            'We sent you a confirmation link. Tap it, then come back and sign in.',
            [{ text: 'OK', onPress: () => setMode('signin') }],
          );
          return;
        }
      } else {
        await signInWithEmail(email.trim(), password);
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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
      setError(err instanceof Error ? err.message : 'Apple sign-in failed.');
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
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(email.trim() && password) && !loading;

  return (
    <SafeAreaView className="flex-1 bg-pinch-bg dark:bg-pinch-bg-dark" edges={['bottom']}>
      <View className="flex-1 px-6 pt-4">
        <View className="mb-6">
          <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
            <Ionicons name="restaurant" size={24} color={colors.primary} />
          </View>
          <Text className="mb-1 text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text className="text-sm leading-5 text-pinch-muted dark:text-pinch-muted-dark">
            {mode === 'signup'
              ? 'Save unlimited recipes and sync them across devices.'
              : 'Sign in to access your recipe library.'}
          </Text>
        </View>

        <Text className="mb-2 text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
          Email
        </Text>
        <View className="mb-4 flex-row items-center rounded-2xl border border-pinch-border bg-pinch-surface px-3.5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
          <TextInput
            className="flex-1 px-3 py-4 text-base text-pinch-dark dark:text-pinch-text-dark"
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />
        </View>

        <Text className="mb-2 text-sm font-semibold text-pinch-dark dark:text-pinch-text-dark">
          Password
        </Text>
        <View className="mb-5 flex-row items-center rounded-2xl border border-pinch-border bg-pinch-surface px-3.5 dark:border-pinch-border-dark dark:bg-pinch-surface-dark">
          <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
          <TextInput
            className="flex-1 px-3 py-4 text-base text-pinch-dark dark:text-pinch-text-dark"
            placeholder="••••••••"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        {error && (
          <View className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-[#3A2424]">
            <Text className="text-sm text-red-700 dark:text-red-300">{error}</Text>
          </View>
        )}

        <Pressable
          className={`items-center rounded-full py-4 ${
            canSubmit
              ? 'bg-pinch-primary dark:bg-pinch-primary-dark'
              : 'bg-[#D9CFD3] dark:bg-[#3A3034]'
          }`}
          onPress={handleEmail}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-lg font-bold text-white">
              {mode === 'signup' ? 'Sign up' : 'Sign in'}
            </Text>
          )}
        </Pressable>

        <Pressable
          className="items-center py-4"
          onPress={() => {
            setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
            setError(null);
          }}
          disabled={loading}
        >
          <Text className="text-sm font-semibold text-pinch-primary dark:text-pinch-primary-dark">
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </Text>
        </Pressable>

        <View className="my-2 flex-row items-center">
          <View className="h-px flex-1 bg-pinch-border dark:bg-pinch-border-dark" />
          <Text className="mx-3 text-xs text-pinch-muted dark:text-pinch-muted-dark">
            or continue with
          </Text>
          <View className="h-px flex-1 bg-pinch-border dark:bg-pinch-border-dark" />
        </View>

        {isAppleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={999}
            style={{ width: '100%', height: 52, marginBottom: 12, marginTop: 8 }}
            onPress={handleApple}
          />
        )}

        <Pressable
          className="mt-1 flex-row items-center justify-center rounded-full border border-pinch-border bg-pinch-surface py-4 dark:border-pinch-border-dark dark:bg-pinch-surface-dark"
          onPress={handleGoogle}
          disabled={loading}
        >
          <Text className="text-base font-semibold text-pinch-dark dark:text-pinch-text-dark">
            Continue with Google
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
