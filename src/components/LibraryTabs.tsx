import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

type Side = 'library' | 'hub';

const TRACK_PAD = 4;
const PILL_TIMING = { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;

const indexOf = (side: Side) => (side === 'hub' ? 1 : 0);

/**
 * The side a tap on the switcher is heading to. Each side is its own screen with its own switcher, so the screen
 * that opens reads this to start its pill where the tap was and slide it over, instead of showing it already there.
 */
let switchingTo: Side | null = null;

/**
 * "My Library | Hub" (PIN-77): the Hub sits inside the Library instead of having its own tab in the bar. Each side
 * keeps its own screen and address (/ and /hub), so Hub links still open the Hub. Both screens put it right under
 * the TopBar at the top of the list, so it stays in place when you switch; the tab bar's slide (app-tabs.tsx)
 * moves the content, and the pill slides here.
 *
 * Looks like the kit's SegmentedControl (kind="tabs", fullWidth), with one thumb that slides instead of jumping.
 */
export function LibraryTabs({ current }: { current: Side }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const { rtl } = useRtl();
  const reduceMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  // Which side looks chosen: follows a tap at once, then the screen's own side whenever it comes back into view.
  const [shown, setShown] = useState<Side>(current);
  const [startIndex] = useState(() => indexOf(switchingTo === current ? other(current) : current));
  const progress = useSharedValue(startIndex);

  useFocusEffect(
    useCallback(() => {
      const to = indexOf(current);
      if (switchingTo === current) {
        switchingTo = null;
        progress.value = indexOf(other(current));
        progress.value = reduceMotion ? to : withTiming(to, PILL_TIMING);
      } else {
        progress.value = to;
      }
      setShown(current);
    }, [current, progress, reduceMotion]),
  );

  const segmentWidth = Math.max(0, (trackWidth - TRACK_PAD * 3) / 2);
  const step = (segmentWidth + TRACK_PAD) * (rtl ? -1 : 1);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * step }] }));

  function choose(value: Side) {
    if (value === current) return;
    switchingTo = value;
    setShown(value);
    progress.value = reduceMotion ? indexOf(value) : withTiming(indexOf(value), PILL_TIMING);
    router.navigate(value === 'hub' ? '/hub' : '/');
  }

  const options = [
    { value: 'library' as const, label: t('plan.libraryTabs.mine'), trackId: 'library.tab.mine' },
    { value: 'hub' as const, label: t('tabs.hub'), trackId: 'library.tab.hub' },
  ];

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('plan.libraryTabs.label')}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        // Pin the track to the app language, as SnapIntentToggle does: `start` and the slide's sign then agree
        // even before the RTL reload.
        direction: rtl ? 'rtl' : 'ltr',
        alignSelf: 'stretch',
        gap: TRACK_PAD,
        padding: TRACK_PAD,
        borderRadius: Radii.control,
        backgroundColor: colors.backgroundElement,
      }}
    >
      {/* Needs the track's width, from the first layout pass (while the screen is still fading in). */}
      {trackWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: TRACK_PAD,
              bottom: TRACK_PAD,
              start: TRACK_PAD,
              width: segmentWidth,
              borderRadius: 10,
              backgroundColor: colors.surface,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const on = option.value === shown;
        return (
          <Pressable
            key={option.value}
            trackId={option.trackId}
            onPress={() => choose(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: option.value === current }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: MIN_TOUCH,
              paddingHorizontal: 14,
              borderRadius: 10,
            }}
          >
            <Text
              numberOfLines={1}
              color={on ? colors.text : colors.textSecondary}
              style={{ ...type.font('body', 'semibold'), fontSize: 14, lineHeight: 18 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function other(side: Side): Side {
  return side === 'hub' ? 'library' : 'hub';
}
