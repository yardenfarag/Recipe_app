import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable);
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
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        return; // user cancelled
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

  return (
    <SafeAreaView className="flex-1 bg-pinch-cream" edges={['bottom']}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-pinch-dark mb-1">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text className="text-sm text-gray-500 mb-8">
          {mode === 'signup'
            ? 'Save unlimited recipes and sync them across devices.'
            : 'Sign in to access your recipe library.'}
        </Text>

        <Text className="text-sm font-medium text-pinch-dark mb-2">Email</Text>
        <TextInput
          className="bg-white border border-gray-200 rounded-xl px-4 py-4 text-base text-pinch-dark mb-4"
          placeholder="you@example.com"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!loading}
        />

        <Text className="text-sm font-medium text-pinch-dark mb-2">Password</Text>
        <TextInput
          className="bg-white border border-gray-200 rounded-xl px-4 py-4 text-base text-pinch-dark mb-6"
          placeholder="••••••••"
          placeholderTextColor="#9CA3AF"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        {error && (
          <View className="rounded-xl px-4 py-3 mb-6 border bg-red-50 border-red-100">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        <Pressable
          className={`rounded-full py-4 items-center ${
            email.trim() && password ? 'bg-pinch-orange' : 'bg-gray-300'
          }`}
          onPress={handleEmail}
          disabled={!email.trim() || !password || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">
              {mode === 'signup' ? 'Sign up' : 'Sign in'}
            </Text>
          )}
        </Pressable>

        <Pressable
          className="py-4 items-center"
          onPress={() => {
            setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
            setError(null);
          }}
          disabled={loading}
        >
          <Text className="text-sm text-pinch-green font-medium">
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </Text>
        </Pressable>

        <View className="flex-row items-center my-4">
          <View className="flex-1 h-px bg-gray-200" />
          <Text className="mx-3 text-xs text-gray-400">or continue with</Text>
          <View className="flex-1 h-px bg-gray-200" />
        </View>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={{ width: '100%', height: 52, marginBottom: 12 }}
            onPress={handleApple}
          />
        )}

        <Pressable
          className="rounded-full py-4 items-center border border-gray-300 bg-white flex-row justify-center"
          onPress={handleGoogle}
          disabled={loading}
        >
          <Text className="text-base font-semibold text-pinch-dark">Continue with Google</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
