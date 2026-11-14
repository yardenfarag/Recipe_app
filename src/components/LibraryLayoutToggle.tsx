import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { LibraryLayout } from '@/hooks/useLibraryLayout';

type LibraryLayoutToggleProps = {
  layout: LibraryLayout;
  onToggle: () => void;
  color: string;
  backgroundColor: string;
  /**
   * Prefix for the admin Activity log id: `<trackId>.grid` or `<trackId>.list`,
   * named for the layout the tap switches to. A fixed string.
   */
  trackId?: string;
};

/** Icon-only list/grid control with a 3D Y-flip between faces. */
export function LibraryLayoutToggle({
  layout,
  onToggle,
  color,
  backgroundColor,
  trackId = 'library.layout',
}: LibraryLayoutToggleProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(layout === 'grid' ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? layout === 'grid'
        ? 1
        : 0
      : withTiming(layout === 'grid' ? 1 : 0, {
          duration: 520,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
        });
  }, [layout, progress, reduceMotion]);

  const listFace = useAnimatedStyle(() => {
    const rotate = interpolate(progress.value, [0, 1], [0, 180]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.88, 1]);
    return {
      opacity: progress.value < 0.5 ? 1 : 0,
      transform: [{ perspective: 700 }, { rotateY: `${rotate}deg` }, { scale }],
    };
  });

  const gridFace = useAnimatedStyle(() => {
    const rotate = interpolate(progress.value, [0, 1], [-180, 0]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.88, 1]);
    return {
      opacity: progress.value >= 0.5 ? 1 : 0,
      transform: [{ perspective: 700 }, { rotateY: `${rotate}deg` }, { scale }],
    };
  });

  return (
    <Pressable trackId={`${trackId}.${layout === 'list' ? 'grid' : 'list'}`}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={layout === 'list' ? t('library.showGrid') : t('library.showList')}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl active:opacity-80"
      style={{ backgroundColor, flexShrink: 0 }}
    >
      <View
        className="h-5 w-5 items-center justify-center"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[{ position: 'absolute' }, listFace]}>
          <Ionicons name="grid-outline" size={18} color={color} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, gridFace]}>
          <Ionicons name="list-outline" size={18} color={color} />
        </Animated.View>
      </View>
    </Pressable>
  );
}
