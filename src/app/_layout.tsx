import '../global.css';

import { Stack } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';

import { AuthProvider } from '@/hooks/useAuth';
import { ShareIntentRouter } from '@/hooks/useShareIntentRouter';

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ debug: __DEV__, resetOnBackground: true }}>
      <AuthProvider>
        <ShareIntentRouter />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="recipe/[id]"
            options={{ headerShown: true, title: 'Recipe', headerTintColor: '#FF6B35' }}
          />
          <Stack.Screen
            name="recipe/preview"
            options={{ headerShown: true, title: 'Recipe', headerTintColor: '#FF6B35' }}
          />
          <Stack.Screen
            name="auth"
            options={{
              headerShown: true,
              title: 'Sign in',
              headerTintColor: '#FF6B35',
              presentation: 'modal',
            }}
          />
        </Stack>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
