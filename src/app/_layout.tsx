import '../global.css';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/hooks/useAuth';
import { MeasurementProvider } from '@/hooks/useMeasurementPreference';
import { ShareIntentRouter } from '@/hooks/useShareIntentRouter';
import { ThemeProvider, useThemePreference } from '@/hooks/useThemePreference';

// expo-share-intent needs native code, so it can't do anything in Expo Go —
// disabling it there avoids a console warning and pointless listener setup.
// It re-enables itself automatically once running in a dev build (ADR 010).
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function RootNavigator() {
  const { colors, scheme } = useThemePreference();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontWeight: '700', color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
        <Stack.Screen name="recipe/preview" options={{ title: 'Preview' }} />
        <Stack.Screen
          name="auth"
          options={{
            title: 'Welcome',
            presentation: 'modal',
          }}
        />
        <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="admin/usage" options={{ title: 'Usage & tokens' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider
      options={{ debug: __DEV__, resetOnBackground: true, disabled: isExpoGo }}
    >
      <ThemeProvider>
        <MeasurementProvider>
          <ErrorBoundary>
            <AuthProvider>
              <ShareIntentRouter />
              <RootNavigator />
            </AuthProvider>
          </ErrorBoundary>
        </MeasurementProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
