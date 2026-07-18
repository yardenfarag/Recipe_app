import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import { recipeImageSource } from '@/lib/recipeImageSource';

type RecipeImageProps = {
  uri: string;
  /** List row, detail header chip, or legacy full-width hero. */
  variant?: 'thumb' | 'compact' | 'hero';
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
};

const VARIANT_DEFAULT_RADIUS = {
  thumb: 18,
  compact: 16,
  hero: 0,
} as const;

/**
 * Social/YouTube thumbs often bake in dark pillarbox bars on the left/right.
 * At list/detail sizes we clip lightly; compact variants need almost no crop
 * now that we prefer 16:9 CDN/API thumbnails.
 */
export function RecipeImage({
  uri,
  variant = 'thumb',
  style,
  borderRadius = VARIANT_DEFAULT_RADIUS[variant],
}: RecipeImageProps) {
  const { colors } = useThemePreference();
  const [failed, setFailed] = useState(false);
  const scale = 2;

  if (failed) {
    return (
      <View
        style={[
          styles.frame,
          { borderRadius, backgroundColor: colors.primarySoft },
          variant === 'hero'
            ? styles.hero
            : variant === 'compact'
              ? styles.compact
              : styles.thumb,
          style,
        ]}
      >
        <View style={styles.placeholder}>
          <Ionicons name="restaurant" size={variant === 'hero' ? 40 : 28} color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.frame,
        { borderRadius },
        variant === 'hero'
          ? styles.hero
          : variant === 'compact'
            ? styles.compact
            : styles.thumb,
        style,
      ]}
    >
      <Image
        source={recipeImageSource(uri)}
        style={[styles.image, { transform: [{ scaleX: scale }, { scaleY: scale }] }]}
        contentFit="cover"
        contentPosition="center"
        transition={200}
        recyclingKey={uri}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  thumb: {
    width: 72,
    height: 72,
  },
  compact: {
    width: 64,
    height: 64,
  },
  hero: {
    width: '100%',
    height: 260,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
