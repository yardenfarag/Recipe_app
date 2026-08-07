import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WebSidebar } from '@/components/WebSidebar';
import { useBreakpoint } from '@/hooks/useBreakpoint';
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
 * Order: Library · Snap · List · Settings (Snap centered among four).
 * Favorites lives as a Library filter — tab hidden via href: null.
 * On wide viewports, bottom tabs hide and WebSidebar takes over.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const tabBarPaddingBottom = Math.max(insets.bottom, 8);

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

  if (!isWide) {
    return tabs;
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <WebSidebar />
      <View style={{ flex: 1 }}>{tabs}</View>
    </View>
  );
}
