import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Pressable } from '@/components/ui/Pressable';
import { MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { CHROME_MAX_FONT_SCALE } from '@/lib/a11y';

export type SnapIntent = 'extract' | 'invent';

const TRACK_PAD = 4;
const THUMB_RADIUS = 10;

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
  /** Prefix for the admin Activity log id; '.extract' or '.invent' is appended. */
  trackId?: string;
};

/**
 * Snap a recipe or Guess the recipe, in the look of the kit's SegmentedControl (Night Market, PIN-177): an
 * element-coloured track with the chosen side on a surface-coloured thumb. The thumb fades from one side to the
 * other rather than sliding, so it needs no left or right and sits under the right side in Hebrew and Arabic before
 * the RTL reload too. The chosen side's icon takes the brand colour (primary for Snap, accent for Guess), as on the
 * web (SnapIntentSwitch).
 */
export function SnapIntentToggle({
  mode,
  progress,
  extractLabel,
  inventLabel,
  onChange,
  trackId = 'snap_intent',
}: SnapIntentToggleProps) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const { rtl } = useRtl();
  const idleText = colors.textSecondary;
  const activeText = colors.text;

  const extractThumbStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const inventThumbStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const extractTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [activeText, idleText]),
  }));

  const inventTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [idleText, activeText]),
  }));

  const sides = [
    {
      value: 'extract' as const,
      label: extractLabel,
      icon: 'scan-outline' as const,
      iconColor: mode === 'extract' ? colors.primaryText : idleText,
      textStyle: extractTextStyle,
      thumbStyle: extractThumbStyle,
    },
    {
      value: 'invent' as const,
      label: inventLabel,
      icon: 'sparkles-outline' as const,
      iconColor: mode === 'invent' ? colors.accentText : idleText,
      textStyle: inventTextStyle,
      thumbStyle: inventThumbStyle,
    },
  ];

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        // Pin the track to the app language, not I18nManager: after a language switch the native flag lags until
        // a cold start, and `left` may get swapped to `right` depending on it.
        direction: rtl ? 'rtl' : 'ltr',
        gap: TRACK_PAD,
        borderRadius: Radii.control,
        backgroundColor: colors.backgroundElement,
        padding: TRACK_PAD,
      }}
    >
      {sides.map((side) => (
        <Pressable
          key={side.value}
          trackId={`${trackId}.${side.value}`}
          onPress={() => onChange(side.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === side.value }}
          accessibilityLabel={side.label}
          style={{
            flex: 1,
            minHeight: MIN_TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingHorizontal: 8,
            borderRadius: THUMB_RADIUS,
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: THUMB_RADIUS, backgroundColor: colors.surface }, side.thumbStyle]}
          />
          <Ionicons
            name={side.icon}
            size={16}
            color={side.iconColor}
            accessible={false}
            importantForAccessibility="no"
          />
          <Animated.Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            style={[
              {
                ...type.font('body', 'semibold'),
                fontSize: 14,
                lineHeight: 18,
                flexShrink: 1,
                writingDirection: rtl ? 'rtl' : 'ltr',
              },
              side.textStyle,
            ]}
          >
            {side.label}
          </Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}
