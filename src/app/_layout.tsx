import '../global.css';
import '../webStyles';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InAppMessageHost } from '@/components/inAppMessages/InAppMessageHost';
import { ScreenViewLogger } from '@/components/ScreenViewLogger';
import { WebCheckoutReturnDialog } from '@/components/WebCheckoutReturnDialog';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { ToastHost } from '@/components/ToastHost';
import { AccountLocaleSync } from '@/components/AccountLocaleSync';
import { WebSidebar } from '@/components/WebSidebar';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
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

/** Screens that stand alone on the website: no side navigation next to them. */
const NO_SIDEBAR_SEGMENTS = new Set([
  'onboarding',
  'welcome',
  'auth',
  'auth-callback',
  'reset-password',
  'legal',
  'admin',
  's',
]);

function RootNavigator() {
  const { colors, scheme } = useThemePreference();
  const { t } = useTranslation();
  const { ready: onboardingReady } = useOnboarding();
  const { user, loading: authLoading } = useAuth();
  const { isDesktopWeb } = useBreakpoint();
  const segments = useSegments();
  // Desktop website: the side navigation stays put on every signed-in screen,
  // including the ones pushed over the tabs (a recipe, a settings page). PIN-109.
  // Shown while the session loads too, so the page doesn't jump sideways when it arrives.
  const showSidebar =
    isDesktopWeb && (Boolean(user) || authLoading) && !NO_SIDEBAR_SEGMENTS.has(segments[0] ?? '');

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {onboardingReady ? (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
        {showSidebar ? <WebSidebar /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
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
        </View>
        </View>
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
