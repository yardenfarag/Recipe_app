import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

export type SnapIntent = 'extract' | 'invent';

const TRACK_PAD = 4;
const TRACK_RADIUS = 16;
const PILL_RADIUS = 12;

export const SNAP_INTENT_TIMING = {
  duration: 320,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
} as const;

/** 0 = extract, 1 = invent. Shared so labels and CTAs can follow the same motion. */
export function useSnapIntentProgress(mode: SnapIntent): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(mode === 'invent' ? 1 : 0);

  useEffect(() => {
    const next = mode === 'invent' ? 1 : 0;
    progress.value = reduceMotion ? next : withTiming(next, SNAP_INTENT_TIMING);
  }, [mode, progress, reduceMotion]);

  return progress;
}

type SnapIntentToggleProps = {
  mode: SnapIntent;
  progress: SharedValue<number>;
  extractLabel: string;
  inventLabel: string;
  onChange: (mode: SnapIntent) => void;
};

/** Sliding-pill intent switch. Radius stays on the thumb so the track never looks square. */
export function SnapIntentToggle({
  mode,
  progress,
  extractLabel,
  inventLabel,
  onChange,
}: SnapIntentToggleProps) {
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const [trackWidth, setTrackWidth] = useState(0);
  const extractColor = colors.primary;
  const inventColor = colors.accent;
  const idleText = colors.text;

  const pillWidth = Math.max(0, (trackWidth - TRACK_PAD * 2) / 2);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== trackWidth) setTrackWidth(next);
  };

  const thumbStyle = useAnimatedStyle(() => {
    if (pillWidth <= 0) return { opacity: 0 };
    const translateX = interpolate(
      progress.value,
      [0, 1],
      rtl ? [pillWidth, 0] : [0, pillWidth],
    );
    return {
      opacity: 1,
      width: pillWidth,
      transform: [{ translateX }],
      backgroundColor: interpolateColor(progress.value, [0, 1], [extractColor, inventColor]),
    };
  });

  const extractTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], ['#ffffff', idleText]),
  }));

  const inventTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [idleText, '#ffffff']),
  }));

  return (
    <View
      onLayout={onTrackLayout}
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderRadius: TRACK_RADIUS,
        overflow: 'hidden',
        backgroundColor: colors.background,
        padding: TRACK_PAD,
      }}
    >
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: TRACK_PAD,
              bottom: TRACK_PAD,
              left: TRACK_PAD,
              borderRadius: PILL_RADIUS,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      <Pressable
        className="min-h-[44px] flex-1 items-center justify-center px-2"
        onPress={() => onChange('extract')}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'extract' }}
        accessibilityLabel={extractLabel}
      >
        <Animated.Text
          className="text-center text-sm font-bold"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[extractTextStyle, { writingDirection: rtl ? 'rtl' : 'ltr' }]}
        >
          {extractLabel}
        </Animated.Text>
      </Pressable>
      <Pressable
        className="min-h-[44px] flex-1 items-center justify-center px-2"
        onPress={() => onChange('invent')}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'invent' }}
        accessibilityLabel={inventLabel}
      >
        <Animated.Text
          className="text-center text-sm font-bold"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[inventTextStyle, { writingDirection: rtl ? 'rtl' : 'ltr' }]}
        >
          {inventLabel}
        </Animated.Text>
      </Pressable>
    </View>
  );
}
