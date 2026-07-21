import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { useThemePreference } from '@/hooks/useThemePreference';
import type { ThemePackColors, ThemePackId } from '@/constants/themes';

const { width, height } = Dimensions.get('window');

function DriftOrb({
  size,
  color,
  x,
  y,
  duration,
}: {
  size: number;
  color: string;
  x: number;
  y: number;
  duration: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: t.value * 18 - 9 },
      { translateX: t.value * 10 - 5 },
      { scale: 1 + t.value * 0.06 },
    ],
    opacity: 0.35 + t.value * 0.2,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Soft mist orbs — Mist Drift. */
function MistEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  return (
    <>
      <DriftOrb size={200} color={colors.mistOrbA} x={-60} y={40} duration={5600} />
      <DriftOrb size={160} color={colors.mistOrbB} x={width - 90} y={160} duration={7200} />
      {!dense && (
        <DriftOrb size={100} color={colors.mistOrbC} x={width * 0.35} y={420} duration={6400} />
      )}
    </>
  );
}

function Berry({
  x,
  y,
  color,
  leaf,
  delay,
  size = 18,
}: {
  x: number;
  y: number;
  color: string;
  leaf: string;
  delay: number;
  size?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 4800, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [-8, 10]) },
      { rotate: `${interpolate(t.value, [0, 1], [-8, 8])}deg` },
    ],
    opacity: 0.45 + t.value * 0.25,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={size + 8} height={size + 10} viewBox="0 0 26 28">
        <Path d="M13 2 C16 6 18 8 13 10 C8 8 10 6 13 2Z" fill={leaf} opacity={0.85} />
        <Circle cx="13" cy="18" r="9" fill={color} />
        <Circle cx="10" cy="15" r="2.2" fill="#FFFFFF" opacity={0.35} />
      </Svg>
    </Animated.View>
  );
}

function Bubble({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -120]) },
      { translateX: interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, 8, 0, -8, 0]) },
    ],
    opacity: interpolate(t.value, [0, 0.2, 0.8, 1], [0, 0.4, 0.35, 0]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    />
  );
}

function FruityEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  return (
    <>
      <DriftOrb size={180} color={colors.mistOrbA} x={-50} y={60} duration={6200} />
      <DriftOrb size={140} color={colors.mistOrbB} x={width - 80} y={200} duration={7800} />
      <Berry x={24} y={90} color={colors.primary} leaf={colors.accent} delay={0} />
      <Berry x={width - 56} y={160} color={colors.accent} leaf={colors.primary} delay={400} size={16} />
      {!dense && (
        <>
          <Berry x={width * 0.42} y={380} color={colors.primary} leaf={colors.accent} delay={800} size={14} />
          <Bubble x={width * 0.2} y={height * 0.55} color={colors.primary} delay={0} />
          <Bubble x={width * 0.7} y={height * 0.6} color={colors.accent} delay={1200} />
          <Bubble x={width * 0.45} y={height * 0.7} color={colors.primary} delay={2400} />
        </>
      )}
    </>
  );
}

function PawPrint({
  x,
  y,
  color,
  delay,
  scale = 1,
}: {
  x: number;
  y: number;
  color: string;
  delay: number;
  scale?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 900 }),
          withTiming(0, { duration: 1600, easing: Easing.in(Easing.cubic) }),
          withTiming(0, { duration: 2200 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value * 0.4,
    transform: [{ scale: scale * (0.92 + t.value * 0.08) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: x, top: y }, style]}
    >
      <Svg width={36} height={32} viewBox="0 0 36 32">
        <Ellipse cx="18" cy="22" rx="9" ry="7" fill={color} />
        <Circle cx="8" cy="10" r="4.2" fill={color} />
        <Circle cx="15" cy="6" r="4" fill={color} />
        <Circle cx="23" cy="6" r="4" fill={color} />
        <Circle cx="29" cy="11" r="4.2" fill={color} />
      </Svg>
    </Animated.View>
  );
}

function CatEar({ x, y, color, flip }: { x: number; y: number; color: string; flip?: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(t.value, [0, 1], flip ? [12, 2] : [-12, -2])}deg` },
      { translateY: interpolate(t.value, [0, 1], [0, -4]) },
    ],
    opacity: 0.35,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={28} height={28} viewBox="0 0 28 28">
        <Path
          d={flip ? 'M4 24 L24 24 L14 4 Z' : 'M4 24 L24 24 L14 4 Z'}
          fill={color}
        />
      </Svg>
    </Animated.View>
  );
}

function CatEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  return (
    <>
      <DriftOrb size={190} color={colors.mistOrbA} x={-40} y={50} duration={6000} />
      <DriftOrb size={150} color={colors.mistOrbB} x={width - 100} y={180} duration={7400} />
      <CatEar x={18} y={70} color={colors.primary} />
      <CatEar x={width - 46} y={100} color={colors.accent} flip />
      <PawPrint x={40} y={220} color={colors.primary} delay={0} />
      <PawPrint x={width - 90} y={300} color={colors.accent} delay={900} scale={0.85} />
      {!dense && (
        <>
          <PawPrint x={width * 0.35} y={440} color={colors.primary} delay={1800} scale={0.75} />
          <PawPrint x={width * 0.55} y={520} color={colors.accent} delay={2700} scale={0.7} />
        </>
      )}
    </>
  );
}

function Candle({ x, y, wax, flame, delay }: { x: number; y: number; wax: string; flame: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -3]) },
      { scaleY: 0.92 + t.value * 0.12 },
    ],
    opacity: 0.55 + t.value * 0.25,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={20} height={40} viewBox="0 0 20 40">
        <Rect x="7" y="16" width="6" height="20" rx="2" fill={wax} />
        <Ellipse cx="10" cy="12" rx="5" ry="8" fill={flame} opacity={0.9} />
        <Ellipse cx="10" cy="10" rx="2.5" ry="4" fill="#FFF8E0" opacity={0.7} />
      </Svg>
    </Animated.View>
  );
}

function Spark({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 5500, easing: Easing.linear }), -1, false),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [20, -90]) },
      { translateX: interpolate(t.value, [0, 1], [0, 12]) },
    ],
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 0.7, 0.5, 0]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function PotterEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  return (
    <>
      <DriftOrb size={170} color={colors.mistOrbA} x={-50} y={80} duration={6800} />
      <DriftOrb size={130} color={colors.mistOrbB} x={width - 70} y={220} duration={8000} />
      <Candle x={28} y={100} wax={colors.surfaceSoft} flame={colors.accent} delay={0} />
      <Candle x={width - 48} y={140} wax={colors.surfaceSoft} flame={colors.primary} delay={300} />
      {!dense && (
        <>
          <Candle x={width * 0.48} y={360} wax={colors.surfaceSoft} flame={colors.accent} delay={600} />
          <Spark x={width * 0.25} y={height * 0.5} color={colors.accent} delay={0} />
          <Spark x={width * 0.6} y={height * 0.55} color={colors.primary} delay={900} />
          <Spark x={width * 0.4} y={height * 0.65} color={colors.accent} delay={1800} />
        </>
      )}
    </>
  );
}

function Bat({
  startX,
  y,
  color,
  delay,
  duration,
}: {
  startX: number;
  y: number;
  color: string;
  delay: number;
  duration: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, false),
    );
  }, [delay, duration, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [startX, startX + width * 0.55]) },
      { translateY: interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, -12, 0, 12, 0]) },
    ],
    opacity: interpolate(t.value, [0, 0.1, 0.85, 1], [0, 0.35, 0.3, 0]),
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: y, left: 0 }, style]}>
      <Svg width={36} height={18} viewBox="0 0 36 18">
        <Path
          d="M18 10 C14 4 8 2 2 6 C8 8 10 12 14 12 L18 10 L22 12 C26 12 28 8 34 6 C28 2 22 4 18 10Z"
          fill={color}
        />
      </Svg>
    </Animated.View>
  );
}

function DraculaEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  return (
    <>
      <DriftOrb size={200} color={colors.mistOrbA} x={-70} y={30} duration={7000} />
      <DriftOrb size={160} color={colors.mistOrbB} x={width - 80} y={200} duration={8500} />
      {/* Soft moon */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 28,
          top: 72,
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: colors.accent,
          opacity: 0.22,
        }}
      />
      <Bat startX={-40} y={120} color={colors.primary} delay={0} duration={14000} />
      {!dense && (
        <>
          <Bat startX={-20} y={260} color={colors.accent} delay={2000} duration={16000} />
          <Bat startX={-60} y={400} color={colors.primary} delay={4500} duration={15000} />
          <DriftOrb size={90} color={colors.mistOrbC} x={width * 0.3} y={480} duration={6400} />
        </>
      )}
    </>
  );
}

function Sunbeam({
  angle,
  color,
  delay,
}: {
  angle: number;
  color: string;
  delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.1 + t.value * 0.12,
    transform: [
      { rotate: `${angle}deg` },
      { scaleY: 0.94 + t.value * 0.08 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: -14,
          width: 28,
          height: height * 0.62,
          borderRadius: 14,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function SunnyEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.06 }],
    opacity: 0.55 + pulse.value * 0.2,
  }));

  return (
    <>
      <DriftOrb size={180} color={colors.mistOrbA} x={-40} y={100} duration={6400} />
      {/* Pivot at the sun so beams radiate outward */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 40, right: 40, width: 1, height: 1 }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -55,
              left: -55,
              width: 110,
              height: 110,
              borderRadius: 55,
              backgroundColor: colors.accent,
            },
            sunStyle,
          ]}
        />
        <View
          style={{
            position: 'absolute',
            top: -36,
            left: -36,
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.primary,
            opacity: 0.5,
          }}
        />
        <Sunbeam angle={12} color={colors.primary} delay={0} />
        <Sunbeam angle={32} color={colors.accent} delay={400} />
        <Sunbeam angle={52} color={colors.primary} delay={800} />
        {!dense && <Sunbeam angle={72} color={colors.accent} delay={1200} />}
      </View>
      {!dense && (
        <DriftOrb size={120} color={colors.mistOrbB} x={40} y={380} duration={7200} />
      )}
    </>
  );
}

function Twinkle({
  x,
  y,
  color,
  delay,
  size = 3,
}: {
  x: number;
  y: number;
  color: string;
  delay: number;
  size?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.2, { duration: 1100 }),
          withTiming(0.85, { duration: 700 }),
          withTiming(0.15, { duration: 1300 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value * 0.85,
    transform: [{ scale: 0.6 + t.value * 0.6 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function ShootingStar({ color, delay }: { color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 5000 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 0.7, 0.4, 0]),
    transform: [
      { translateX: interpolate(t.value, [0, 1], [width * 0.1, width * 0.75]) },
      { translateY: interpolate(t.value, [0, 1], [80, 220]) },
      { rotate: '28deg' },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: 56,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function StarryEffects({ colors, dense }: { colors: ThemePackColors; dense?: boolean }) {
  const stars = [
    [40, 70],
    [90, 140],
    [width - 50, 90],
    [width - 100, 180],
    [width * 0.35, 120],
    [width * 0.55, 200],
    [60, 260],
    [width - 70, 300],
  ] as const;

  return (
    <>
      <DriftOrb size={200} color={colors.mistOrbA} x={-60} y={40} duration={8000} />
      <DriftOrb size={140} color={colors.mistOrbB} x={width - 90} y={250} duration={9000} />
      {/* Soft moon */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 36,
          top: 64,
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.accent,
          opacity: 0.28,
        }}
      />
      {stars.slice(0, dense ? 4 : 8).map(([x, y], i) => (
        <Twinkle
          key={`star-${i}`}
          x={x}
          y={y}
          color={i % 3 === 0 ? colors.accent : '#FFFFFF'}
          delay={i * 280}
          size={i % 2 === 0 ? 3 : 2}
        />
      ))}
      {!dense && <ShootingStar color={colors.accent} delay={2500} />}
    </>
  );
}

function PackEffects({
  packId,
  colors,
  dense,
}: {
  packId: ThemePackId;
  colors: ThemePackColors;
  dense?: boolean;
}) {
  switch (packId) {
    case 'fruity':
      return <FruityEffects colors={colors} dense={dense} />;
    case 'cat':
      return <CatEffects colors={colors} dense={dense} />;
    case 'potter':
      return <PotterEffects colors={colors} dense={dense} />;
    case 'dracula':
      return <DraculaEffects colors={colors} dense={dense} />;
    case 'sunny':
      return <SunnyEffects colors={colors} dense={dense} />;
    case 'starry':
      return <StarryEffects colors={colors} dense={dense} />;
    case 'mist':
    default:
      return <MistEffects colors={colors} dense={dense} />;
  }
}

type MistAtmosphereProps = {
  children: ReactNode;
  /** Fewer atmospheric accents on dense screens (e.g. settings). */
  dense?: boolean;
};

/**
 * Theme-aware Drift canvas — gradient wash + pack-specific calm animations
 * (berries, paws, candles, bats, sunbeams, stars…).
 */
export function MistAtmosphere({ children, dense }: MistAtmosphereProps) {
  const { colors, packId } = useThemePreference();

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.mistGradient]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <PackEffects key={packId} packId={packId} colors={colors} dense={dense} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
});
