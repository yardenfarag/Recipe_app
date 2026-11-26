import '../global.css';
// Creates the Supabase client before any screen or shared module uses it.
import '@/lib/supabase/client';

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ShareIntentProvider } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DialogHost } from '@/components/DialogHost';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InAppMessageHost } from '@/components/inAppMessages/InAppMessageHost';
import { PushNotificationsSetup } from '@/components/PushNotificationsSetup';
import { ScreenViewLogger } from '@/components/ScreenViewLogger';
import { WebCheckoutReturnDialog } from '@/components/WebCheckoutReturnDialog';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { ToastHost } from '@/components/ToastHost';
import { AccountLocaleSync } from '@/components/AccountLocaleSync';
import { FONT_ASSETS } from '@/constants/fonts';
import { AuthProvider } from '@/hooks/useAuth';
import { LanguageProvider } from '@/hooks/useLanguagePreference';
import { MeasurementProvider } from '@/hooks/useMeasurementPreference';
import { UnitSystemProvider } from '@/hooks/useUnitSystemPreference';
import { OnboardingProvider, useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingGate } from '@/hooks/useOnboardingGate';
import { ShareIntentRouter } from '@/hooks/useShareIntentRouter';
import { ThemeProvider, useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { I18nProvider } from '@/i18n';

// expo-share-intent needs native code, so it can't do anything in Expo Go —
// disabling it there avoids a console warning and pointless listener setup.
// It re-enables itself automatically once running in a dev build (ADR 010).
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// The splash screen stays up until the Night Market fonts (Inter, Space Grotesk) have loaded (PIN-177).
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Keep Library under recipe/deep links so the header back control has a target. */
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

function RootNavigator() {
  const { colors, scheme } = useThemePreference();
  const { t } = useTranslation();
  const type = useTypography();
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
            headerTitleStyle: { ...type.font('display', 'bold'), fontSize: 17, color: colors.text },
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
          {/* Right after onboarding: pick at least one first recipe, so no swipe back past it. */}
          <Stack.Screen
            name="first-recipes"
            options={{ headerShown: false, animation: 'fade', gestureEnabled: false }}
          />
          {/* Before first-recipes, for new accounts only (PIN-181): a sheet offering to scan the kitchen. Same rules. */}
          <Stack.Screen
            name="pantry-intro"
            options={{ headerShown: false, animation: 'slide_from_bottom', gestureEnabled: false }}
          />
          {/* Scan your kitchen (PIN-181). The screen asks before it's left mid-scan, and sets its own title. */}
          <Stack.Screen
            name="pantry/scan"
            options={{
              title: t('pantry.scan.title'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/settings/pantry" />
              ),
            }}
          />
          {/* The photo runs to the top of the screen with back on it (PIN-177): no header. */}
          <Stack.Screen name="recipe/[id]" options={{ title: t('nav.recipe'), headerShown: false }} />
          {/* Edit recipe / Write a recipe (PIN-79). The screen sets its own Cancel and Save. */}
          <Stack.Screen name="recipe/edit" options={{ headerBackVisible: false }} />
          <Stack.Screen name="recipe/preview" options={{ title: t('nav.preview'), headerShown: false }} />
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
          {/* Import recipes from a WhatsApp chat (ADR 032), from the Add tab or a shared export. */}
          <Stack.Screen
            name="whatsapp-import"
            options={{
              title: t('whatsappImport.entryTitle'),
              headerLeft: (props) => (
                <StackHeaderBackButton tintColor={props.tintColor} fallback="/add" />
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
            name="settings/pantry"
            options={{
              title: t('pantry.title'),
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
            name="settings/emails"
            options={{
              title: t('messages.title'),
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
          {/* The Night Market kit on one screen, for us (PIN-177). Admin pages are in English. */}
          <Stack.Screen name="admin/kit" options={{ title: 'Kit' }} />
        </Stack>
      ) : null}
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  // Loaded at runtime (not by a config plugin), so the fonts ship over the air. A font that fails to load falls back
  // to the system font rather than keeping the app behind the splash screen.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const fontsSettled = fontsLoaded || fontError != null;

  useEffect(() => {
    if (fontsSettled) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <ShareIntentProvider
      options={{ debug: __DEV__, resetOnBackground: false, disabled: isExpoGo }}
    >
      <ThemeProvider>
        <LanguageProvider>
          <I18nProvider>
            <MeasurementProvider>
              <UnitSystemProvider>
                <OnboardingProvider>
                  <ErrorBoundary>
                    <AuthProvider>
                      <AccountLocaleSync />
                      <OnboardingGate />
                      <ShareIntentRouter />
                      <ScreenViewLogger />
                      <PushNotificationsSetup />
                      <RootNavigator />
                      <InAppMessageHost />
                      <WebCheckoutReturnDialog />
                      <DialogHost />
                    </AuthProvider>
                  </ErrorBoundary>
                </OnboardingProvider>
              </UnitSystemProvider>
            </MeasurementProvider>
          </I18nProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ShareIntentProvider>
  );
}
