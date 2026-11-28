import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CookieMark } from '@/components/CookieMark';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { SNAP_REVEAL, revealWindow } from '@shared/lib/snapReveal';

/**
 * The Snap reveal on phones (PIN-192): the first time a just-snapped recipe opens, it builds in front of the cook.
 * Title, then the cover, then the ingredients one by one, then the facts and steps, about 1.5 s in all
 * (`SNAP_REVEAL`, shared with the web app). One progress value drives every piece, so a tap can jump it to the end.
 * With reduced motion or a screen reader on, everything shows at once.
 */
export function useSnapReveal(active: boolean, onDone?: () => void) {
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const progress = useSharedValue(animate ? 0 : 1);
  const [revealing, setRevealing] = useState(animate);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimation(progress);
    progress.value = 1;
    setRevealing(false);
    onDoneRef.current?.();
  }, [progress]);

  useEffect(() => {
    if (!active) return;
    if (!animate) {
      finish();
      return;
    }
    progress.value = withTiming(1, { duration: SNAP_REVEAL.total, easing: Easing.linear });
    const timer = setTimeout(finish, SNAP_REVEAL.total);
    // A screen reader reads the page, not the show: give it everything now.
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (on && !cancelled) finish();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Plays once, when the page first shows the recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { progress: active ? progress : null, revealing, skip: finish };
}

/** Fades in (and rises a little) while the reveal's progress runs from `start` to `end` milliseconds. */
export function RevealView({
  progress,
  start,
  end,
  rise = 12,
  style,
  children,
}: {
  progress: SharedValue<number>;
  start: number;
  end: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [from, to] = revealWindow(start, end);
  const animated = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * rise }] };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * A container that keeps its style either way, and fades in during the reveal: for a section's own root, where an
 * extra wrapper would break the layout (a flex child of a row, say).
 */
export function RevealBox({
  progress,
  at,
  rise,
  style,
  children,
}: {
  progress: SharedValue<number> | null;
  at: readonly [number, number];
  rise?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  if (!progress) return <View style={style}>{children}</View>;
  return (
    <RevealView progress={progress} start={at[0]} end={at[1]} rise={rise} style={style}>
      {children}
    </RevealView>
  );
}

/** Several blocks that appear together. Outside the reveal there is no wrapper at all, so the page is as before. */
export function RevealGroup({
  progress,
  at,
  rise,
  style,
  children,
}: {
  progress: SharedValue<number> | null;
  at: readonly [number, number];
  rise?: number;
  /** The parent's gap, so the blocks inside keep their spacing. */
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  if (!progress) return <>{children}</>;
  return (
    <RevealView progress={progress} start={at[0]} end={at[1]} rise={rise} style={style}>
      {children}
    </RevealView>
  );
}

const FLIGHT_SIZE = 112;
/** The phone tab bar: five tabs, the Library first (app-tabs.tsx). */
const TAB_COUNT = 5;
const TAB_BAR_CONTENT_HEIGHT = 56;

/**
 * The "Saved" moment: a small copy of the cover drops toward the Library tab, then `onLanded` (the haptic and the
 * "Saved · Remove" strip). Phones only; the Expo web build lands at once.
 */
export function SavedFlight({
  imageUrl,
  title,
  rtl,
  onLanded,
}: {
  imageUrl: string | null;
  title: string;
  rtl: boolean;
  onLanded: () => void;
}) {
  const { colors } = useThemePreference();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const skip = reduceMotion || Platform.OS === 'web';
  const t = useSharedValue(0);
  const landedRef = useRef(onLanded);
  useEffect(() => {
    landedRef.current = onLanded;
  });

  useEffect(() => {
    if (skip) {
      landedRef.current();
      return;
    }
    t.value = withTiming(1, { duration: SNAP_REVEAL.flight, easing: Easing.in(Easing.cubic) });
    const timer = setTimeout(() => landedRef.current(), SNAP_REVEAL.flight);
    return () => clearTimeout(timer);
  }, [skip, t]);

  const startX = width / 2 - FLIGHT_SIZE / 2;
  const startY = insets.top + 96;
  const tabCenter = ((rtl ? TAB_COUNT - 0.5 : 0.5) / TAB_COUNT) * width;
  const endX = tabCenter - FLIGHT_SIZE / 2;
  const endY = height - Math.max(insets.bottom, 8) - TAB_BAR_CONTENT_HEIGHT / 2 - FLIGHT_SIZE / 2;

  const animated = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: interpolate(p, [0, 0.1, 0.85, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: startX + (endX - startX) * p },
        // A little lift before the drop, so it reads as "put away" rather than "fell".
        { translateY: startY + (endY - startY) * p - Math.sin(p * Math.PI) * 40 },
        { scale: interpolate(p, [0, 1], [1, 0.22]) },
      ],
    };
  });

  if (skip) return null;

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 0, start: 0, end: 0, bottom: 0, zIndex: 50 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: FLIGHT_SIZE,
            height: FLIGHT_SIZE,
            borderRadius: Radii.tile,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            overflow: 'hidden',
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          },
          animated,
        ]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: 6, padding: 10 }}>
            <CookieMark size={40} color={colors.onPrimary} holeColor={colors.primary} />
            <Text variant="caption" weight="semibold" color={colors.onPrimary} numberOfLines={2} align="center">
              {title}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
