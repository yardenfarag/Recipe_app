import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InAppMessageBanner } from '@/components/inAppMessages/InAppMessageBanner';
import { FirstRunWalkthrough } from '@/components/onboarding/FirstRunWalkthrough';
import { WebSidebar } from '@/components/WebSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { offerRemindersOnce } from '@/lib/pushPrompt';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useThemePreference } from '@/hooks/useThemePreference';

const TAB_BAR_CONTENT_HEIGHT = 56;

/**
 * Standard (non-experimental) expo-router Tabs.
 *
 * NOTE: `expo-router/unstable-native-tabs` crashes when combined with
 * NativeWind's babel/css-interop JSX wrapping (TypeError: Cannot read
 * property 'displayName' of undefined). Stick to the stable `Tabs` API
 * until that's resolved upstream.
 *
 * Order: Library · Hub · Snap · List · Settings.
 * Favorites lives as a Library filter — tab hidden via href: null.
 * On wide viewports, bottom tabs hide and WebSidebar takes over.
 * Right after onboarding, FirstRunWalkthrough coaches over the bottom tab bar.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const tabBarPaddingBottom = Math.max(insets.bottom, 8);
  const { walkthroughPending, finishWalkthrough } = useOnboarding();
  const { user } = useAuth();
  const segments = useSegments();
  // Tabs stay mounted under pushed screens; only coach while a tab is showing.
  const showWalkthrough = walkthroughPending && !isWide && segments[0] === '(tabs)';

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: isWide
          ? { display: 'none' }
          : {
              backgroundColor: colors.tabBar,
              borderTopColor: colors.frostedBorder,
              borderTopWidth: 1,
              height: TAB_BAR_CONTENT_HEIGHT + tabBarPaddingBottom,
              paddingTop: 6,
              paddingBottom: tabBarPaddingBottom,
            },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        // The bar has a fixed height; like native UITabBar, keep labels at their
        // base size (icons + labels are still announced by screen readers).
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'book' : 'book-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="hub"
        options={{
          title: t('tabs.hub'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.snap'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: t('tabs.list'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );

  // In-app message banners: the top one pushes the screen down, the bottom one floats above the tab bar.
  // On wide web they sit in the content column, beside WebSidebar.
  const withBanners = (
    <View style={{ flex: 1 }}>
      <InAppMessageBanner position="top" />
      <View style={{ flex: 1 }}>{tabs}</View>
      <InAppMessageBanner position="bottom" />
    </View>
  );

  if (!isWide) {
    return (
      <>
        {withBanners}
        {showWalkthrough ? (
          <FirstRunWalkthrough
            tabBarHeight={TAB_BAR_CONTENT_HEIGHT + tabBarPaddingBottom}
            tabBarPaddingBottom={tabBarPaddingBottom}
            onFinish={() => {
              void finishWalkthrough();
              // After the tour (and the first-recipes picker before it): offer the cooking reminders.
              if (user) void offerRemindersOnce(user.id, t);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <WebSidebar />
      {withBanners}
    </View>
  );
}
