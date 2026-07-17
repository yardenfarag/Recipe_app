import '../global.css';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';

import { AuthProvider } from '@/hooks/useAuth';
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
        <AuthProvider>
          <ShareIntentRouter />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
