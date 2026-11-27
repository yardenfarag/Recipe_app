import { Tabs, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, I18nManager, Platform, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InAppMessageBanner } from '@/components/inAppMessages/InAppMessageBanner';
import { FirstRunWalkthrough } from '@/components/onboarding/FirstRunWalkthrough';
import { KitIcon, type IconName } from '@/components/ui/tokens';
import { WebSidebar } from '@/components/WebSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { offerRemindersOnce } from '@/lib/pushPrompt';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

const TAB_BAR_CONTENT_HEIGHT = 56;
const TAB_ICON_SIZE = 22;

/** Outline when inactive, filled when active ("heavier" icon), as on the web's bottom bar. */
function tabIcon(outline: IconName, filled: IconName) {
  function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return <KitIcon icon={focused ? filled : outline} color={color} size={TAB_ICON_SIZE} />;
  }
  return TabIcon;
}

const SNAP_BUTTON_SIZE = 44;

/** How far a tab's screen slides as it fades in or out (React Navigation's own 'shift' uses 50). */
const TAB_SHIFT_DISTANCE = 40;
const TAB_TRANSITION_SPEC = {
  animation: 'timing',
  config: { duration: 220, easing: Easing.out(Easing.cubic) },
} as const;

/**
 * React Navigation's 'shift' (fade and a short slide towards the tab you picked), but mirrored in Hebrew and
 * Arabic: there the bar runs right to left, so a tab further along comes in from the left. Follows I18nManager,
 * which is what lays the bar out.
 */
function tabShiftInterpolator(rtl: boolean) {
  const distance = rtl ? -TAB_SHIFT_DISTANCE : TAB_SHIFT_DISTANCE;
  return ({ current }: { current: { progress: Animated.Value } }) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-distance, 0, distance],
          }),
        },
      ],
    },
  });
}

/**
 * Snap, the main action: a plus on a brand-coloured rounded square in the middle of the bar, level with the other
 * tabs (not raised, no shadow). While Snap is open it gets a ring in the soft brand colour.
 */
function SnapTabIcon({ focused }: { focused: boolean }) {
  const { colors } = useThemePreference();
  return (
    <View
      style={{
        width: SNAP_BUTTON_SIZE,
        height: SNAP_BUTTON_SIZE,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderWidth: 3,
        borderColor: focused ? colors.primarySoft : colors.primary,
      }}
    >
      <KitIcon icon="add" color={colors.onPrimary} size={28} />
    </View>
  );
}

/**
 * Standard (non-experimental) expo-router Tabs.
 *
 * NOTE: `expo-router/unstable-native-tabs` crashes when combined with
 * NativeWind's babel/css-interop JSX wrapping (TypeError: Cannot read
 * property 'displayName' of undefined). Stick to the stable `Tabs` API
 * until that's resolved upstream.
 *
 * Night Market (PIN-177): five tabs, Library · Plan · Snap · List · Settings (the Hub is a tab of the Library, PIN-77). Snap is a plus on a brand-coloured
 * square, level with the others (not the web's raised button). The active tab is in the text colour with a filled icon, the others muted; a hairline on
 * top in the border colour.
 * Favorites lives as a Library filter — tab hidden via href: null.
 * On wide viewports, bottom tabs hide and WebSidebar takes over.
 * Right after onboarding, FirstRunWalkthrough coaches over the bottom tab bar.
 * On phones, switching tabs (and Library ↔ Hub) fades and slides the screen a little towards the chosen tab.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const tabBarPaddingBottom = Math.max(insets.bottom, 8);
  const { walkthroughPending, finishWalkthrough } = useOnboarding();
  const { user } = useAuth();
  const segments = useSegments();
  // Tabs stay mounted under pushed screens; only coach while a tab is showing.
  const showWalkthrough = walkthroughPending && !isWide && segments[0] === '(tabs)';
  const reduceMotion = useReducedMotion();
  // Phones only: the Expo web app (sidebar on wide screens) switches at once, as a website does.
  const tabTransition =
    Platform.OS === 'web'
      ? ({ animation: 'none' } as const)
      : reduceMotion
        ? ({ animation: 'fade' } as const)
        : ({
            animation: 'shift',
            sceneStyleInterpolator: tabShiftInterpolator(I18nManager.isRTL),
            transitionSpec: TAB_TRANSITION_SPEC,
          } as const);

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...tabTransition,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: isWide
          ? { display: 'none' }
          : {
              backgroundColor: colors.tabBar,
              borderTopColor: colors.border,
              borderTopWidth: 1,
              // Flat, like the rest of Night Market.
              elevation: 0,
              shadowOpacity: 0,
              height: TAB_BAR_CONTENT_HEIGHT + tabBarPaddingBottom,
              paddingTop: 6,
              paddingBottom: tabBarPaddingBottom,
            },
        tabBarLabelStyle: {
          ...type.font('body', 'semibold'),
          fontSize: 11,
          lineHeight: 15,
          // The icon's 28-tall box and React Navigation's padding leave the label less than its height, and on
          // Expo web it shrank and was cut off ("Librarv"). It keeps its height; the tab pads a little less.
          flexShrink: 0,
        },
        tabBarItemStyle: isWide ? undefined : { paddingTop: 2, paddingBottom: 2 },
        // The bar has a fixed height; like native UITabBar, keep labels at their
        // base size (icons + labels are still announced by screen readers).
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.library'),
          tabBarIcon: tabIcon('grid-outline', 'grid'),
        }}
      />
      {/* The Hub is a tab of the Library ("My Library | Hub", PIN-77), not of the bar. It comes right after the
          Library so the slide runs the way the switcher reads: Library → Hub (and Hub → Plan) towards the end. */}
      <Tabs.Screen
        name="hub"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: t('tabs.plan'),
          tabBarIcon: tabIcon('calendar-outline', 'calendar'),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.snap'),
          tabBarAccessibilityLabel: t('snap.title'),
          // No label under the plus. (`tabBarShowLabel` is read from the open tab and would hide every label.)
          tabBarLabel: () => null,
          tabBarIconStyle: { width: SNAP_BUTTON_SIZE, height: SNAP_BUTTON_SIZE },
          tabBarIcon: SnapTabIcon,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: t('tabs.list'),
          // The cart leans one way, so KitIcon mirrors it in Hebrew and Arabic.
          tabBarIcon: tabIcon('cart-outline', 'cart'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: tabIcon('settings-outline', 'settings'),
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
      {/* What shows through while two tab screens cross-fade: the page colour, also in dark mode. */}
      <View style={{ flex: 1, backgroundColor: colors.background }}>{tabs}</View>
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
