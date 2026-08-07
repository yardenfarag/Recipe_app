import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
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
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { useThemePreference } from '@/hooks/useThemePreference';
import type { ThemePackColors, ThemePackId } from '@/constants/themes';

type Viewport = { width: number; height: number };

/** Soft color wash — kept subtle so motif icons stay the visual focus. */
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
    opacity: 0.22 + t.value * 0.12,
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

/** Shared float / sway wrapper for motif icons. */
function DriftMotif({
  x,
  y,
  delay = 0,
  duration = 5200,
  sway = 8,
  bob = 10,
  children,
}: {
  x: number;
  y: number;
  delay?: number;
  duration?: number;
  sway?: number;
  bob?: number;
  children: ReactNode;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, duration, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [-bob, bob]) },
      { translateX: interpolate(t.value, [0, 1], [-sway * 0.35, sway * 0.35]) },
      { rotate: `${interpolate(t.value, [0, 1], [-sway, sway])}deg` },
    ],
    opacity: 0.5 + t.value * 0.28,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      {children}
    </Animated.View>
  );
}

/* ─── Mist ─────────────────────────────────────────────────────────────── */

function MistCloud({ color, w = 56 }: { color: string; w?: number }) {
  const h = w * 0.55;
  return (
    <Svg width={w} height={h} viewBox="0 0 56 30">
      <Ellipse cx="18" cy="18" rx="14" ry="9" fill={color} />
      <Ellipse cx="32" cy="14" rx="16" ry="11" fill={color} />
      <Ellipse cx="44" cy="19" rx="11" ry="8" fill={color} />
    </Svg>
  );
}

function MistEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  return (
    <>
      <DriftOrb size={200} color={colors.mistOrbA} x={-60} y={40} duration={5600} />
      <DriftOrb size={160} color={colors.mistOrbB} x={width - 90} y={160} duration={7200} />
      <DriftMotif x={20} y={88} delay={0} duration={6400} sway={6} bob={12}>
        <MistCloud color={colors.primary} w={64} />
      </DriftMotif>
      <DriftMotif x={width - 78} y={150} delay={500} duration={7200} sway={5} bob={10}>
        <MistCloud color={colors.accent} w={52} />
      </DriftMotif>
      {!dense && (
        <>
          <DriftOrb size={100} color={colors.mistOrbC} x={width * 0.35} y={420} duration={6400} />
          <DriftMotif x={width * 0.4} y={360} delay={900} duration={6800} sway={7} bob={14}>
            <MistCloud color={colors.primary} w={48} />
          </DriftMotif>
        </>
      )}
    </>
  );
}

/* ─── Fruity ───────────────────────────────────────────────────────────── */

function Strawberry({ color, leaf, size = 28 }: { color: string; leaf: string; size?: number }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 28 32">
      <Path
        d="M14 6 C18 2 24 4 24 10 C24 18 20 28 14 30 C8 28 4 18 4 10 C4 4 10 2 14 6Z"
        fill={color}
      />
      <Path d="M10 7 C12 3 14 2 14 2 C14 2 16 3 18 7 C15 6 13 6 10 7Z" fill={leaf} />
      <Path d="M13 2 L14.5 8 L15.5 2" stroke={leaf} strokeWidth="1.4" fill="none" />
      <Circle cx="10" cy="14" r="1.1" fill="#FFF8E8" opacity={0.55} />
      <Circle cx="16" cy="16" r="1" fill="#FFF8E8" opacity={0.5} />
      <Circle cx="12" cy="20" r="1" fill="#FFF8E8" opacity={0.45} />
      <Circle cx="17" cy="22" r="0.9" fill="#FFF8E8" opacity={0.4} />
      <Circle cx="9" cy="23" r="0.9" fill="#FFF8E8" opacity={0.4} />
    </Svg>
  );
}

function CherryPair({ color, stem, size = 30 }: { color: string; stem: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M16 4 C16 4 10 8 8 14"
        stroke={stem}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M16 4 C16 4 22 9 24 15"
        stroke={stem}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx="8" cy="20" r="7" fill={color} />
      <Circle cx="24" cy="21" r="6.5" fill={color} />
      <Circle cx="6" cy="17" r="1.8" fill="#FFFFFF" opacity={0.35} />
      <Circle cx="22" cy="18" r="1.6" fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

function Citrus({ color, rind, size = 26 }: { color: string; rind: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Circle cx="14" cy="14" r="12" fill={color} />
      <Circle cx="14" cy="14" r="9.5" fill={rind} opacity={0.35} />
      <Path d="M14 5 L14 23" stroke={rind} strokeWidth="1.2" opacity={0.55} />
      <Path d="M5.5 11 L22.5 17" stroke={rind} strokeWidth="1.2" opacity={0.45} />
      <Path d="M5.5 17 L22.5 11" stroke={rind} strokeWidth="1.2" opacity={0.45} />
      <Circle cx="14" cy="14" r="2" fill={rind} opacity={0.5} />
      <Path d="M14 2 C15 0 17 1 16 3" stroke={rind} strokeWidth="1.4" fill="none" />
    </Svg>
  );
}

function Apple({ color, leaf, size = 26 }: { color: string; leaf: string; size?: number }) {
  return (
    <Svg width={size} height={size * 1.1} viewBox="0 0 28 30">
      <Path
        d="M14 8 C10 8 5 11 5 18 C5 24 9 28 14 28 C19 28 23 24 23 18 C23 11 18 8 14 8Z"
        fill={color}
      />
      <Path d="M14 8 C12 5 14 2 16 4" stroke={leaf} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Ellipse cx="18" cy="6" rx="5" ry="2.5" fill={leaf} transform="rotate(25 18 6)" />
      <Ellipse cx="10" cy="14" rx="2.2" ry="3" fill="#FFFFFF" opacity={0.25} />
    </Svg>
  );
}

function FruityEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  return (
    <>
      <DriftOrb size={160} color={colors.mistOrbA} x={-50} y={60} duration={6200} />
      <DriftOrb size={120} color={colors.mistOrbB} x={width - 80} y={200} duration={7800} />
      <DriftMotif x={22} y={86} delay={0} sway={10}>
        <Strawberry color={colors.primary} leaf={colors.accent} size={30} />
      </DriftMotif>
      <DriftMotif x={width - 58} y={150} delay={350} duration={5600} sway={9}>
        <CherryPair color={colors.primary} stem={colors.accent} size={32} />
      </DriftMotif>
      {!dense && (
        <>
          <DriftMotif x={width * 0.38} y={340} delay={700} duration={6000} sway={8}>
            <Citrus color={colors.accent} rind={colors.primary} size={28} />
          </DriftMotif>
          <DriftMotif x={width * 0.62} y={460} delay={1100} duration={6400} sway={11}>
            <Apple color={colors.primary} leaf={colors.accent} size={26} />
          </DriftMotif>
          <DriftMotif x={36} y={480} delay={1400} duration={5800} sway={7}>
            <CherryPair color={colors.accent} stem={colors.primary} size={24} />
          </DriftMotif>
        </>
      )}
    </>
  );
}

/* ─── Cat ──────────────────────────────────────────────────────────────── */

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
    opacity: t.value * 0.55,
    transform: [{ scale: scale * (0.92 + t.value * 0.08) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={40} height={36} viewBox="0 0 40 36">
        <Ellipse cx="20" cy="24" rx="10" ry="8" fill={color} />
        <Circle cx="8" cy="11" r="4.6" fill={color} />
        <Circle cx="16" cy="6" r="4.4" fill={color} />
        <Circle cx="26" cy="6" r="4.4" fill={color} />
        <Circle cx="33" cy="12" r="4.6" fill={color} />
      </Svg>
    </Animated.View>
  );
}

function CatFace({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Path d="M6 14 L4 4 L14 10 Z" fill={color} />
      <Path d="M30 14 L32 4 L22 10 Z" fill={color} />
      <Ellipse cx="18" cy="20" rx="13" ry="12" fill={color} />
      <Circle cx="13" cy="18" r="2.2" fill="#2A2634" opacity={0.55} />
      <Circle cx="23" cy="18" r="2.2" fill="#2A2634" opacity={0.55} />
      <Path d="M18 21 L16 24 L20 24 Z" fill="#2A2634" opacity={0.4} />
      <Line x1="4" y1="20" x2="11" y2="22" stroke={color} strokeWidth="1.2" opacity={0.7} />
      <Line x1="4" y1="23" x2="11" y2="23" stroke={color} strokeWidth="1.2" opacity={0.7} />
      <Line x1="32" y1="20" x2="25" y2="22" stroke={color} strokeWidth="1.2" opacity={0.7} />
      <Line x1="32" y1="23" x2="25" y2="23" stroke={color} strokeWidth="1.2" opacity={0.7} />
    </Svg>
  );
}

function YarnBall({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Circle cx="14" cy="14" r="11" fill={color} />
      <Path
        d="M6 10 C12 8 16 12 22 10 M5 15 C12 13 16 17 23 15 M7 20 C13 18 17 21 21 19"
        stroke="#FFFFFF"
        strokeWidth="1.3"
        fill="none"
        opacity={0.45}
      />
      <Path
        d="M22 8 C26 4 28 10 24 12"
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CatEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  return (
    <>
      <DriftOrb size={170} color={colors.mistOrbA} x={-40} y={50} duration={6000} />
      <DriftOrb size={130} color={colors.mistOrbB} x={width - 100} y={180} duration={7400} />
      <DriftMotif x={18} y={78} delay={0} sway={6} bob={8}>
        <CatFace color={colors.primary} size={36} />
      </DriftMotif>
      <DriftMotif x={width - 52} y={120} delay={400} duration={5600} sway={9}>
        <YarnBall color={colors.accent} size={30} />
      </DriftMotif>
      <PawPrint x={44} y={230} color={colors.primary} delay={0} />
      <PawPrint x={width - 96} y={310} color={colors.accent} delay={900} scale={0.85} />
      {!dense && (
        <>
          <PawPrint x={width * 0.35} y={450} color={colors.primary} delay={1800} scale={0.75} />
          <DriftMotif x={width * 0.55} y={520} delay={1000} duration={6200} sway={10}>
            <YarnBall color={colors.primary} size={24} />
          </DriftMotif>
        </>
      )}
    </>
  );
}

/* ─── Wizard ───────────────────────────────────────────────────────────── */

function RoundGlasses({ color, size = 44 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.45} viewBox="0 0 48 22">
      <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.4" />
      <Circle cx="36" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.4" />
      <Path d="M21 12 H27" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M3 11 H3.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M44.5 11 H45" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function LightningScar({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size * 0.55} height={size} viewBox="0 0 14 28">
      <Path
        d="M8 1 L2 14 H7 L4 27 L13 11 H8 Z"
        fill={color}
      />
    </Svg>
  );
}

function Wand({ color, tip, size = 36 }: { color: string; tip: string; size?: number }) {
  return (
    <Svg width={size * 0.35} height={size} viewBox="0 0 12 40">
      <Rect x="4.5" y="8" width="3" height="30" rx="1.5" fill={color} />
      <Path d="M6 2 L4 8 L8 8 Z" fill={tip} />
      <Circle cx="6" cy="4" r="2.2" fill={tip} opacity={0.7} />
    </Svg>
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
      { rotate: `${interpolate(t.value, [0, 1], [0, 90])}deg` },
    ],
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 0.75, 0.5, 0]),
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path d="M6 0 L7 5 L12 6 L7 7 L6 12 L5 7 L0 6 L5 5 Z" fill={color} />
      </Svg>
    </Animated.View>
  );
}

function WizardEffects({
  colors,
  dense,
  width,
  height,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
  height: number;
}) {
  return (
    <>
      <DriftOrb size={150} color={colors.mistOrbA} x={-50} y={80} duration={6800} />
      <DriftOrb size={110} color={colors.mistOrbB} x={width - 70} y={220} duration={8000} />
      <DriftMotif x={20} y={96} delay={0} sway={7} bob={8}>
        <RoundGlasses color={colors.primary} size={48} />
      </DriftMotif>
      <DriftMotif x={width - 42} y={130} delay={300} duration={4800} sway={5} bob={12}>
        <LightningScar color={colors.accent} size={28} />
      </DriftMotif>
      {!dense && (
        <>
          <DriftMotif x={width * 0.42} y={340} delay={600} duration={5600} sway={6}>
            <Wand color={colors.primary} tip={colors.accent} size={40} />
          </DriftMotif>
          <DriftMotif x={width * 0.15} y={420} delay={900} duration={6000} sway={8}>
            <RoundGlasses color={colors.accent} size={36} />
          </DriftMotif>
          <DriftMotif x={width * 0.7} y={480} delay={1200} duration={5200} sway={6} bob={14}>
            <LightningScar color={colors.primary} size={22} />
          </DriftMotif>
          <Spark x={width * 0.28} y={height * 0.5} color={colors.accent} delay={0} />
          <Spark x={width * 0.62} y={height * 0.55} color={colors.primary} delay={900} />
          <Spark x={width * 0.45} y={height * 0.65} color={colors.accent} delay={1800} />
        </>
      )}
    </>
  );
}

/* ─── Dracula ──────────────────────────────────────────────────────────── */

function Fangs({ color, gum, size = 28 }: { color: string; gum: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 32 28">
      <Path d="M4 6 Q16 0 28 6 L28 12 Q16 8 4 12 Z" fill={gum} />
      <Path d="M8 10 L11 26 L14 10 Z" fill={color} />
      <Path d="M18 10 L21 26 L24 10 Z" fill={color} />
    </Svg>
  );
}

function BloodDrop({
  x,
  y,
  color,
  delay,
  size = 12,
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
      withRepeat(withTiming(1, { duration: 4200, easing: Easing.in(Easing.quad) }), -1, false),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, 90]) },
      { scale: interpolate(t.value, [0, 0.1, 1], [0.6, 1, 0.85]) },
    ],
    opacity: interpolate(t.value, [0, 0.12, 0.75, 1], [0, 0.7, 0.55, 0]),
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <Svg width={size} height={size * 1.35} viewBox="0 0 12 16">
        <Path d="M6 0 C6 0 12 8 12 11 C12 14 9.3 16 6 16 C2.7 16 0 14 0 11 C0 8 6 0 6 0Z" fill={color} />
        <Ellipse cx="4.2" cy="10" rx="1.4" ry="2" fill="#FFFFFF" opacity={0.3} />
      </Svg>
    </Animated.View>
  );
}

function Bat({
  startX,
  y,
  color,
  delay,
  duration,
  width,
}: {
  startX: number;
  y: number;
  color: string;
  delay: number;
  duration: number;
  width: number;
}) {
  const t = useSharedValue(0);
  const flap = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, false),
    );
    flap.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 380, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [delay, duration, flap, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [startX, startX + width * 0.55]) },
      { translateY: interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, -14, 0, 14, 0]) },
      { scaleY: interpolate(flap.value, [0, 1], [0.75, 1.15]) },
    ],
    opacity: interpolate(t.value, [0, 0.1, 0.85, 1], [0, 0.45, 0.38, 0]),
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: y, left: 0 }, style]}>
      <Svg width={42} height={22} viewBox="0 0 42 22">
        <Path
          d="M21 12 C16 3 9 1 2 7 C9 9 11 14 16 14 L21 12 L26 14 C31 14 33 9 40 7 C33 1 26 3 21 12Z"
          fill={color}
        />
        <Circle cx="21" cy="12" r="3.2" fill={color} />
        <Path d="M19 10 L18 7 M23 10 L24 7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function DraculaEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  return (
    <>
      <DriftOrb size={180} color={colors.mistOrbA} x={-70} y={30} duration={7000} />
      <DriftOrb size={140} color={colors.mistOrbB} x={width - 80} y={200} duration={8500} />
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
      <DriftMotif x={24} y={100} delay={0} sway={5} bob={7}>
        <Fangs color="#F4EDE6" gum={colors.primary} size={32} />
      </DriftMotif>
      <BloodDrop x={36} y={130} color={colors.primary} delay={0} size={11} />
      <BloodDrop x={48} y={128} color={colors.primary} delay={700} size={9} />
      <Bat startX={-40} y={160} color={colors.primary} delay={0} duration={14000} width={width} />
      {!dense && (
        <>
          <DriftMotif x={width - 56} y={280} delay={500} duration={5800} sway={6}>
            <Fangs color="#F4EDE6" gum={colors.accent} size={26} />
          </DriftMotif>
          <BloodDrop x={width - 42} y={310} color={colors.primary} delay={400} size={10} />
          <BloodDrop x={width - 30} y={308} color={colors.accent} delay={1100} size={8} />
          <Bat startX={-20} y={300} color={colors.accent} delay={2000} duration={16000} width={width} />
          <Bat startX={-60} y={440} color={colors.primary} delay={4500} duration={15000} width={width} />
          <BloodDrop x={width * 0.45} y={400} color={colors.primary} delay={1800} size={12} />
        </>
      )}
    </>
  );
}

/* ─── Sunny ────────────────────────────────────────────────────────────── */

function SunIcon({ core, ray, size = 40 }: { core: string; ray: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <G>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <Line
            key={deg}
            x1="20"
            y1="4"
            x2="20"
            y2="9"
            stroke={ray}
            strokeWidth="2.4"
            strokeLinecap="round"
            transform={`rotate(${deg} 20 20)`}
          />
        ))}
      </G>
      <Circle cx="20" cy="20" r="9" fill={core} />
      <Circle cx="17" cy="17" r="2.5" fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

function CloudPuff({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size * 0.55} viewBox="0 0 40 22">
      <Ellipse cx="14" cy="14" rx="10" ry="7" fill={color} />
      <Ellipse cx="24" cy="11" rx="12" ry="8" fill={color} />
      <Ellipse cx="32" cy="15" rx="7" ry="5" fill={color} />
    </Svg>
  );
}

function SunnyEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  const sunStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.07 }],
    opacity: 0.6 + pulse.value * 0.25,
  }));

  return (
    <>
      <DriftOrb size={160} color={colors.mistOrbA} x={-40} y={100} duration={6400} />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 48, right: 28 }, sunStyle]}
      >
        <SunIcon core={colors.primary} ray={colors.accent} size={56} />
      </Animated.View>
      <DriftMotif x={24} y={140} delay={200} duration={6800} sway={8} bob={10}>
        <CloudPuff color={colors.accent} size={42} />
      </DriftMotif>
      {!dense && (
        <>
          <DriftMotif x={width * 0.35} y={360} delay={600} duration={5600} sway={9}>
            <SunIcon core={colors.accent} ray={colors.primary} size={32} />
          </DriftMotif>
          <DriftMotif x={width * 0.55} y={480} delay={1000} duration={7200} sway={7}>
            <CloudPuff color={colors.primary} size={34} />
          </DriftMotif>
        </>
      )}
    </>
  );
}

/* ─── Starry ───────────────────────────────────────────────────────────── */

function StarShape({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 1 L14.6 8.4 L22.5 9.1 L16.5 14.2 L18.4 22 L12 17.8 L5.6 22 L7.5 14.2 L1.5 9.1 L9.4 8.4 Z"
        fill={color}
      />
    </Svg>
  );
}

function TwinkleStar({
  x,
  y,
  color,
  delay,
  size = 14,
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
          withTiming(0.25, { duration: 1100 }),
          withTiming(0.9, { duration: 700 }),
          withTiming(0.2, { duration: 1300 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + t.value * 0.7,
    transform: [
      { scale: 0.65 + t.value * 0.45 },
      { rotate: `${interpolate(t.value, [0, 1], [-8, 8])}deg` },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y }, style]}>
      <StarShape color={color} size={size} />
    </Animated.View>
  );
}

function CrescentMoon({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Path
        d="M22 4 C12 6 6 16 10 26 C14 32 24 34 30 28 C22 30 14 24 14 16 C14 10 18 5 22 4Z"
        fill={color}
      />
    </Svg>
  );
}

function ShootingStar({
  color,
  delay,
  width,
}: {
  color: string;
  delay: number;
  width: number;
}) {
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
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 0.8, 0.45, 0]),
    transform: [
      { translateX: interpolate(t.value, [0, 1], [width * 0.1, width * 0.75]) },
      { translateY: interpolate(t.value, [0, 1], [80, 220]) },
      { rotate: '28deg' },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <Svg width={64} height={14} viewBox="0 0 64 14">
        <Path d="M0 7 H48" stroke={color} strokeWidth="2" strokeLinecap="round" opacity={0.55} />
        <Path
          d="M52 1 L55 5.5 L62 6.2 L56.5 9.2 L58 14 L52 11 L46 14 L47.5 9.2 L42 6.2 L49 5.5 Z"
          fill={color}
        />
      </Svg>
    </Animated.View>
  );
}

function StarryEffects({
  colors,
  dense,
  width,
}: {
  colors: ThemePackColors;
  dense?: boolean;
  width: number;
}) {
  const stars = [
    [36, 70, 16],
    [90, 140, 11],
    [width - 54, 96, 14],
    [width - 110, 180, 10],
    [width * 0.35, 120, 12],
    [width * 0.55, 200, 15],
    [52, 270, 10],
    [width - 76, 310, 13],
  ] as const;

  return (
    <>
      <DriftOrb size={180} color={colors.mistOrbA} x={-60} y={40} duration={8000} />
      <DriftOrb size={120} color={colors.mistOrbB} x={width - 90} y={250} duration={9000} />
      <DriftMotif x={width - 64} y={58} delay={0} duration={9000} sway={4} bob={6}>
        <CrescentMoon color={colors.accent} size={40} />
      </DriftMotif>
      {stars.slice(0, dense ? 4 : 8).map(([x, y, size], i) => (
        <TwinkleStar
          key={`star-${i}`}
          x={x}
          y={y}
          color={i % 3 === 0 ? colors.accent : '#FFFFFF'}
          delay={i * 280}
          size={size}
        />
      ))}
      {!dense && <ShootingStar color={colors.accent} delay={2500} width={width} />}
    </>
  );
}

function PackEffects({
  packId,
  colors,
  dense,
  viewport,
}: {
  packId: ThemePackId;
  colors: ThemePackColors;
  dense?: boolean;
  viewport: Viewport;
}) {
  const { width, height } = viewport;
  switch (packId) {
    case 'fruity':
      return <FruityEffects colors={colors} dense={dense} width={width} />;
    case 'cat':
      return <CatEffects colors={colors} dense={dense} width={width} />;
    case 'wizard':
      return <WizardEffects colors={colors} dense={dense} width={width} height={height} />;
    case 'dracula':
      return <DraculaEffects colors={colors} dense={dense} width={width} />;
    case 'sunny':
      return <SunnyEffects colors={colors} dense={dense} width={width} />;
    case 'starry':
      return <StarryEffects colors={colors} dense={dense} width={width} />;
    case 'mist':
    default:
      return <MistEffects colors={colors} dense={dense} width={width} />;
  }
}

type MistAtmosphereProps = {
  children: ReactNode;
  /** Fewer atmospheric accents on dense screens (e.g. settings). */
  dense?: boolean;
};

/**
 * Theme-aware Drift canvas — gradient wash + pack-specific motif icons
 * (fruit, glasses/scar, fangs, paws, sun, stars…).
 */
export function MistAtmosphere({ children, dense }: MistAtmosphereProps) {
  const { colors, packId } = useThemePreference();
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...colors.mistGradient]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <PackEffects
          key={`${packId}-${Math.round(width)}-${Math.round(height)}`}
          packId={packId}
          colors={colors}
          dense={dense}
          viewport={{ width, height }}
        />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
});
