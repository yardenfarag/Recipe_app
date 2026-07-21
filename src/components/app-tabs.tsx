import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';

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
 */
export default function AppTabs() {
  const { colors } = useThemePreference();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.frostedBorder,
          borderTopWidth: 1,
          height: Platform.select({ ios: 88, android: 68 }),
          paddingTop: 6,
          paddingBottom: Platform.select({ ios: 28, android: 10 }),
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
          title: 'Library',
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
          title: 'Snap',
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
          title: 'List',
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
          title: 'Settings',
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
}
