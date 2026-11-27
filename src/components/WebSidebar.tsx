import { type Href, router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { PinchLogo } from '@/components/ui/PinchLogo';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { WebSidebarWidth } from '@/constants/theme';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

type NavItem = {
  href: Href;
  labelKey: 'tabs.library' | 'tabs.plan' | 'tabs.snap' | 'tabs.list' | 'tabs.settings';
  icon: IconName;
  iconFocused: IconName;
  match: (path: string) => boolean;
};

// The same icons as the bottom tabs (app-tabs.tsx).
const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    labelKey: 'tabs.library',
    icon: 'grid-outline',
    iconFocused: 'grid',
    // The Hub is a tab of the Library (PIN-77).
    match: (path) => path === '/' || path.startsWith('/favorites') || path === '' || path === '/hub' || path.startsWith('/hub/'),
  },
  {
    href: '/plan',
    labelKey: 'tabs.plan',
    icon: 'calendar-outline',
    iconFocused: 'calendar',
    match: (path) => path === '/plan',
  },
  {
    href: '/add',
    labelKey: 'tabs.snap',
    icon: 'add-circle-outline',
    iconFocused: 'add-circle',
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

/** The navigation rail at the start of a wide (desktop) layout, in place of the bottom tabs. */
export function WebSidebar() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const pathname = usePathname();

  return (
    <View
      style={{
        width: WebSidebarWidth,
        borderEndWidth: HAIRLINE,
        borderEndColor: colors.border,
        backgroundColor: colors.tabBar,
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 14,
      }}
    >
      <PinchLogo style={{ marginBottom: 32, paddingHorizontal: 8 }} />

      <View style={{ gap: 4 }} role="navigation">
        {NAV_ITEMS.map((item) => {
          const focused = item.match(pathname);
          const color = focused ? colors.text : colors.textSecondary;
          return (
            <Pressable
              key={item.labelKey}
              trackId={`nav.sidebar.${item.labelKey.replace('tabs.', '')}`}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                if (!focused) router.push(item.href);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 48,
                paddingHorizontal: 12,
                borderRadius: Radii.control,
                backgroundColor: focused || pressed ? colors.backgroundElement : 'transparent',
              })}
            >
              <KitIcon icon={focused ? item.iconFocused : item.icon} color={color} size={22} />
              <Text
                numberOfLines={1}
                color={color}
                style={{ ...type.font('body', 'semibold'), fontSize: 15, lineHeight: 20, flex: 1 }}
              >
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
