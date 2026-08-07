import '../global.css';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { AuthProvider } from '@/hooks/useAuth';
import { LanguageProvider } from '@/hooks/useLanguagePreference';
import { MeasurementProvider } from '@/hooks/useMeasurementPreference';
import { OnboardingProvider, useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingGate } from '@/hooks/useOnboardingGate';
import { ShareIntentRouter } from '@/hooks/useShareIntentRouter';
import { ThemeProvider, useThemePreference } from '@/hooks/useThemePreference';
import { I18nProvider } from '@/i18n';

// expo-share-intent needs native code, so it can't do anything in Expo Go —
// disabling it there avoids a console warning and pointless listener setup.
// It re-enables itself automatically once running in a dev build (ADR 010).
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Keep Library under recipe/deep links so the header back control has a target. */
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootNavigator() {
  const { colors, scheme } = useThemePreference();
  const { t } = useTranslation();
  const { ready: onboardingReady } = useOnboarding();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {onboardingReady ? (
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontWeight: '700', color: colors.text },
            contentStyle: { backgroundColor: colors.background },
            // Avoid "(tabs)" (route group name) as the iOS back label.
            headerBackButtonDisplayMode: 'minimal',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen
            name="recipe/[id]"
            options={{
              title: t('nav.recipe'),
              headerLeft: (props) => <StackHeaderBackButton tintColor={props.tintColor} />,
            }}
          />
          <Stack.Screen
            name="recipe/preview"
            options={{
              title: t('nav.preview'),
              headerLeft: (props) => <StackHeaderBackButton tintColor={props.tintColor} />,
            }}
          />
          <Stack.Screen
            name="s/[token]"
            options={{
              title: t('nav.sharedRecipe'),
              headerLeft: (props) => <StackHeaderBackButton tintColor={props.tintColor} />,
            }}
          />
          <Stack.Screen
            name="auth"
            options={{
              title: t('nav.welcome'),
              presentation: 'modal',
            }}
          />
          <Stack.Screen name="reset-password" options={{ title: t('nav.resetPassword') }} />
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
          <Stack.Screen name="admin/usage" options={{ title: t('nav.usage') }} />
        </Stack>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <ShareIntentProvider
      options={{ debug: __DEV__, resetOnBackground: false, disabled: isExpoGo }}
    >
      <ThemeProvider>
        <LanguageProvider>
          <I18nProvider>
            <MeasurementProvider>
              <OnboardingProvider>
                <ErrorBoundary>
                  <AuthProvider>
                    <OnboardingGate />
                    <ShareIntentRouter />
                    <RootNavigator />
                  </AuthProvider>
                </ErrorBoundary>
              </OnboardingProvider>
            </MeasurementProvider>
          </I18nProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
