import '../global.css';
// Creates the Supabase client before any screen or shared module uses it.
import '@/lib/supabase/client';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InAppMessageHost } from '@/components/inAppMessages/InAppMessageHost';
import { ScreenViewLogger } from '@/components/ScreenViewLogger';
import { WebCheckoutReturnDialog } from '@/components/WebCheckoutReturnDialog';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { ToastHost } from '@/components/ToastHost';
import { AccountLocaleSync } from '@/components/AccountLocaleSync';
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
            // Web has no status bar — the extra inset shows up as a dark gap.
            ...(Platform.OS === 'web' ? { headerStatusBarHeight: 0 } : null),
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen
            name="recipe/[id]"
            options={{
              title: t('nav.recipe'),
              headerLeft: (props) => <StackHeaderBackButton tintColor={props.tintColor} />,
            }}
          />
          {/* Edit recipe / Write a recipe (PIN-79). The screen sets its own Cancel and Save. */}
          <Stack.Screen name="recipe/edit" options={{ headerBackVisible: false }} />
          <Stack.Screen
            name="recipe/preview"
            options={{
              title: t('nav.preview'),
              headerShown: Platform.OS !== 'web',
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
            name="hub/[id]"
            options={{
              title: t('hub.recipeTitle'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/hub" />
              ),
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
          <Stack.Screen
            name="cookbook"
            options={{
              title: t('nav.cookbook'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/" />
              ),
            }}
          />
          <Stack.Screen
            name="settings/credits"
            options={{
              title: t('settings.plan'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings" />
              ),
            }}
          />
          <Stack.Screen
            name="settings/recipe"
            options={{
              title: t('settings.recipePreferences'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings" />
              ),
            }}
          />
          <Stack.Screen
            name="settings/appearance"
            options={{
              title: t('settings.appearance'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings" />
              ),
            }}
          />
          <Stack.Screen
            name="settings/language"
            options={{
              title: t('settings.languageAndRegion'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings" />
              ),
            }}
          />
          <Stack.Screen
            name="settings/support"
            options={{
              title: t('settings.legalSupport'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings" />
              ),
            }}
          />
          <Stack.Screen
            name="legal/[doc]"
            options={{
              headerLeft: (props) => (
                <StackHeaderBackButton
                  tintColor={props.tintColor}
                  fallback={Platform.OS === 'web' ? '/' : '/settings/support'}
                />
              ),
            }}
          />
          <Stack.Screen name="admin/dashboard" options={{ headerShown: false, title: 'Pinch admin' }} />
          <Stack.Screen name="admin/insights" options={{ title: t('nav.insights') }} />
          <Stack.Screen name="admin/users" options={{ title: t('nav.people') }} />
          <Stack.Screen name="admin/usage" options={{ title: t('nav.usage') }} />
          <Stack.Screen name="admin/activity" options={{ title: t('nav.activity') }} />
          <Stack.Screen name="admin/messages" options={{ title: t('nav.messages') }} />
        </Stack>
      ) : null}
      <ToastHost />
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
                    <AccountLocaleSync />
                    <OnboardingGate />
                    <ShareIntentRouter />
                    <ScreenViewLogger />
                    <RootNavigator />
                    <InAppMessageHost />
                    <WebCheckoutReturnDialog />
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
