import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import Svg, { Circle } from 'react-native-svg';

import {
  snapEtaAt,
  snapEtaText,
  snapProgressAt,
  snapStatusKeyAt,
  snapStatusLines,
  snapTimingKind,
} from '@shared/lib/snapProgress';

import { CookieMark } from '@/components/CookieMark';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';

/** How often the ring and the countdown move. The ring eases between steps, so it looks continuous. */
const TICK_MS = 250;
const RING_SIZE = 168;
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type SnapExtractingViewProps = {
  intent: 'extract' | 'invent';
  /** The link being read; null for a photo or a PDF. */
  url: string | null;
  /** A PDF is being read (PIN-72). */
  pdf?: boolean;
};

/**
 * The Snap wait, on one flat tile (Night Market, PIN-177; the web's SnapProgress): a ring in the brand colour
 * filling around the cookie, a line in Space Grotesk saying what Pinch is doing, the time left, and what it is
 * reading. Nothing reports real progress, so the ring and the countdown follow how long this kind of source usually
 * takes (shared/lib/snapProgress.ts).
 */
export function SnapExtractingView({ intent, url, pdf = false }: SnapExtractingViewProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const kind = snapTimingKind(intent, url, pdf);
  const lines = useMemo(() => snapStatusLines(intent, url, pdf), [intent, url, pdf]);

  const progress = snapProgressAt(kind, elapsed);
  const lineKey = snapStatusKeyAt(lines, progress);
  const currentLine = t(lineKey);
  const eta = snapEtaText(snapEtaAt(kind, elapsed), t);

  const fill = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // The lines go in order and never loop, so each one is spoken once.
  useEffect(() => {
    announce(currentLine, { liveRegion: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey]);

  useEffect(() => {
    fill.value = withTiming(progress, { duration: TICK_MS, easing: Easing.linear });
  }, [fill, progress]);

  useEffect(() => {
    if (reduceMotion) {
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breath, reduceMotion]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - fill.value),
  }));

  const cookieStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.06 }],
  }));

  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
      <Tile
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          paddingHorizontal: 24,
          paddingVertical: 40,
        }}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={currentLine}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: eta }}
        accessibilityState={{ busy: true }}
      >
        <View
          style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox="0 0 100 100"
            style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
          >
            <Circle cx={50} cy={50} r={RADIUS} fill="none" stroke={colors.backgroundElement} strokeWidth={6} />
            <AnimatedCircle
              cx={50}
              cy={50}
              r={RADIUS}
              fill="none"
              stroke={colors.primary}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              animatedProps={arcProps}
            />
          </Svg>
          <Animated.View style={cookieStyle}>
            <CookieMark size={64} color={colors.primaryText} />
          </Animated.View>
        </View>

        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          <Animated.View
            key={lineKey}
            entering={reduceMotion ? FadeIn.duration(160) : FadeInDown.springify().damping(18)}
            exiting={FadeOut.duration(160)}
          >
            <Text variant="h2" align="center">
              {currentLine}
            </Text>
          </Animated.View>
          <Text
            variant="bodySmall"
            tone="muted"
            align="center"
            style={{ minHeight: 22, fontVariant: ['tabular-nums'] }}
          >
            {eta}
          </Text>
        </View>

        {url ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              maxWidth: '100%',
              borderRadius: Radii.inner,
              backgroundColor: colors.backgroundElement,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Ionicons
              name="link-outline"
              size={16}
              color={colors.textSecondary}
              accessible={false}
              importantForAccessibility="no"
            />
            {/* A link reads left to right in every language. */}
            <Text
              variant="caption"
              tone="muted"
              numberOfLines={1}
              style={{ flexShrink: 1, writingDirection: 'ltr' }}
            >
              {url}
            </Text>
          </View>
        ) : null}
      </Tile>
    </View>
  );
}
