import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
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
};

/** Icon-only list/grid control with a 3D Y-flip between faces. */
export function LibraryLayoutToggle({
  layout,
  onToggle,
  color,
  backgroundColor,
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
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={layout === 'list' ? t('library.showGrid') : t('library.showList')}
      accessibilityState={{ selected: layout === 'grid' }}
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-[14px] active:opacity-80"
      style={{ backgroundColor, flexShrink: 0 }}
    >
      <View className="h-5 w-5 items-center justify-center">
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
