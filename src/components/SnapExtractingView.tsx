import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
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
  /** The link being read; null for a photo. */
  url: string | null;
};

/**
 * Full-screen Snap wait: a ring filling around the cookie, a line saying what Pinch is doing, and the time left.
 * Nothing reports real progress, so the ring and the countdown follow how long this kind of source usually takes
 * (shared/lib/snapProgress.ts).
 */
export function SnapExtractingView({ intent, url }: SnapExtractingViewProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const kind = snapTimingKind(intent, url);
  const lines = useMemo(() => snapStatusLines(intent, url), [intent, url]);

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
    <View
      className="flex-1 items-center justify-center px-8"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={currentLine}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: eta }}
      accessibilityState={{ busy: true }}
    >
      <View
        className="mb-8 items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox="0 0 100 100"
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle cx={50} cy={50} r={RADIUS} fill="none" stroke={colors.primarySoft} strokeWidth={6} />
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
          <CookieMark size={72} color={colors.primary} />
        </Animated.View>
      </View>

      <Animated.Text
        key={lineKey}
        entering={reduceMotion ? FadeIn.duration(160) : FadeInDown.springify().damping(18)}
        exiting={FadeOut.duration(160)}
        className="text-center text-xl font-semibold"
        style={{ color: colors.text }}
      >
        {currentLine}
      </Animated.Text>
      <Text className="mt-2 text-center text-sm" style={{ color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>
        {eta}
      </Text>
    </View>
  );
}
