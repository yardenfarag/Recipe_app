import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { CookieMark } from '@/components/CookieMark';
import { WebSidebarWidth } from '@/constants/theme';
import { useThemePreference } from '@/hooks/useThemePreference';

type NavItem = {
  href: Href;
  labelKey: 'tabs.library' | 'tabs.snap' | 'tabs.list' | 'tabs.settings';
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  match: (path: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    labelKey: 'tabs.library',
    icon: 'book-outline',
    iconFocused: 'book',
    match: (path) => path === '/' || path.startsWith('/favorites') || path === '',
  },
  {
    href: '/add',
    labelKey: 'tabs.snap',
    icon: 'sparkles-outline',
    iconFocused: 'sparkles',
    match: (path) => path.startsWith('/add'),
  },
  {
    href: '/list',
    labelKey: 'tabs.list',
    icon: 'cart-outline',
    iconFocused: 'cart',
    match: (path) => path.startsWith('/list'),
  },
  {
    href: '/settings',
    labelKey: 'tabs.settings',
    icon: 'settings-outline',
    iconFocused: 'settings',
    match: (path) => path.startsWith('/settings'),
  },
];

/** Left rail navigation for wide (desktop) layouts. */
export function WebSidebar() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const pathname = usePathname();

  return (
    <View
      style={{
        width: WebSidebarWidth,
        borderRightWidth: 1,
        borderRightColor: colors.frostedBorder,
        backgroundColor: colors.tabBar,
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 14,
      }}
    >
      <View className="mb-8 flex-row items-center gap-3 px-2">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <CookieMark size={22} color={colors.primary} />
        </View>
        <Text className="text-lg font-bold" style={{ color: colors.text }}>
          Pinch
        </Text>
      </View>

      <View className="gap-1">
        {NAV_ITEMS.map((item) => {
          const focused = item.match(pathname);
          const color = focused ? colors.primary : colors.textSecondary;
          return (
            <Pressable
              key={item.labelKey}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                if (!focused) router.push(item.href);
              }}
              className="flex-row items-center gap-3 rounded-2xl px-3 py-3"
              style={({ pressed }) => ({
                backgroundColor: focused
                  ? colors.primarySoft
                  : pressed
                    ? colors.frosted
                    : 'transparent',
              })}
            >
              <Ionicons
                name={focused ? item.iconFocused : item.icon}
                size={22}
                color={color}
              />
              <Text className="text-[15px] font-semibold" style={{ color }}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
