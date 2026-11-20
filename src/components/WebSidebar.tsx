import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Link, router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';

import { CookieMark } from '@/components/CookieMark';
import { WebSidebarWidth } from '@/constants/theme';
import { useThemePreference } from '@/hooks/useThemePreference';

type NavItem = {
  href: Href;
  labelKey: 'tabs.library' | 'tabs.hub' | 'tabs.snap' | 'tabs.list' | 'tabs.settings';
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  match: (path: string) => boolean;
};

/** The recipe a Snap just produced, before it is saved: still part of Snap. */
const isSnapPreview = (path: string) => path.startsWith('/recipe/preview');

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    labelKey: 'tabs.library',
    icon: 'book-outline',
    iconFocused: 'book',
    match: (path) =>
      path === '/' ||
      path === '' ||
      path.startsWith('/favorites') ||
      (path.startsWith('/recipe') && !isSnapPreview(path)) ||
      path.startsWith('/cookbook'),
  },
  {
    href: '/hub',
    labelKey: 'tabs.hub',
    icon: 'compass-outline',
    iconFocused: 'compass',
    match: (path) => path === '/hub' || path.startsWith('/hub/'),
  },
  {
    href: '/add',
    labelKey: 'tabs.snap',
    icon: 'sparkles-outline',
    iconFocused: 'sparkles',
    match: (path) => path.startsWith('/add') || isSnapPreview(path),
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

/** Tab roots, as opposed to screens pushed on top of them (a recipe, a settings page). */
const TAB_ROOTS = new Set(['', '/', '/hub', '/add', '/list', '/settings', '/favorites']);

/** react-native-web adds hover and keyboard focus to the Pressable state. */
type WebPressableState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/**
 * Side navigation for wide layouts. On the website it stays next to every
 * signed-in screen (root layout); on a wide tablet it sits beside the tabs.
 */
export function WebSidebar() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const pathname = usePathname();
  const onTabRoot = TAB_ROOTS.has(pathname);

  return (
    <View
      role="navigation"
      aria-label={t('a11y.mainNavigation')}
      style={{
        width: WebSidebarWidth,
        borderEndWidth: 1,
        borderEndColor: colors.frostedBorder,
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
          accessible={false}
          importantForAccessibility="no-hide-descendants"
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
          // Already on this tab's own page: nothing to do. From a page inside the
          // section (a recipe, a settings page) the item goes back to its root.
          const current = focused && onTabRoot;
          const color = focused ? colors.primary : colors.textSecondary;
          const row = (
            <Pressable
              trackId={`nav.sidebar.${item.labelKey.replace('tabs.', '')}`}
              accessibilityRole={Platform.OS === 'web' ? 'link' : 'button'}
              accessibilityState={{ selected: focused }}
              aria-current={current ? 'page' : undefined}
              onPress={
                Platform.OS === 'web'
                  ? undefined
                  : () => {
                      if (!current) router.push(item.href);
                    }
              }
              className="flex-row items-center gap-3 rounded-2xl px-3 py-3"
              style={(state) => {
                const { pressed, hovered } = state as WebPressableState;
                return {
                  backgroundColor: focused
                    ? colors.primarySoft
                    : pressed || hovered
                      ? colors.frosted
                      : 'transparent',
                };
              }}
            >
              <Ionicons name={focused ? item.iconFocused : item.icon} size={22} color={color} />
              <Text className="flex-1 text-[15px] font-semibold" style={{ color }}>
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
          if (Platform.OS !== 'web') return <View key={item.labelKey}>{row}</View>;
          // A real link, so it can be opened in a new tab. From a pushed screen (a
          // recipe, a settings page) it pushes, so the browser's Back returns there.
          return (
            <Link key={item.labelKey} href={item.href} push={!onTabRoot} asChild>
              {row}
            </Link>
          );
        })}
      </View>
    </View>
  );
}
