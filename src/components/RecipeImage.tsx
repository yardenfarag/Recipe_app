import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemePreference } from '@/hooks/useThemePreference';
import { recipeImageSource } from '@/lib/recipeImageSource';

type RecipeImageProps = {
  uri: string;
  /** List row, detail header chip, or legacy full-width hero. */
  variant?: 'thumb' | 'compact' | 'hero';
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  /** Pass to expose the photo to screen readers; decorative (hidden) by default. */
  accessibilityLabel?: string;
  /** A picture Pinch drew (recipe.image_generated): shown whole, with a small sparkle mark in a corner. */
  aiGenerated?: boolean;
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
  accessibilityLabel,
  aiGenerated = false,
}: RecipeImageProps) {
  const { colors } = useThemePreference();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  // Native: zoom past baked-in pillarbox bars. Web: CORS often blanks the
  // image, and 2× scale turns that into a huge empty/dark strip. A drawn
  // picture has no bars, and zooming would crop the dish.
  const scale = Platform.OS === 'web' || aiGenerated ? 1 : 2;
  // The mark is the only thing that says the picture was drawn, so a screen reader hears it even
  // where the picture itself is decorative.
  const label = aiGenerated
    ? [accessibilityLabel, t('recipe.aiImage')].filter(Boolean).join(', ')
    : accessibilityLabel;
  const a11yProps = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
  const small = variant !== 'hero';

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (failed) {
    return (
      <View
        {...a11yProps}
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
      {...a11yProps}
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
      <Image
        source={recipeImageSource(uri)}
        style={[styles.image, { transform: [{ scaleX: scale }, { scaleY: scale }] }]}
        contentFit="cover"
        contentPosition="center"
        transition={200}
        recyclingKey={uri}
        onError={() => setFailed(true)}
      />
      {aiGenerated ? (
        <View
          testID="ai-image-mark"
          className={small ? 'absolute bottom-1 end-1 h-5 w-5' : 'absolute bottom-2.5 end-2.5 h-7 w-7'}
          style={styles.aiMark}
        >
          <Ionicons name="sparkles" size={small ? 11 : 14} color="#fff" />
        </View>
      ) : null}
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
  // Over a picture, so the same in light and dark (the web's bg-scrim/70).
  aiMark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
