import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type RecipeImageProps = {
  uri: string;
  /** Thumbnail (list) vs hero (detail). */
  variant?: 'thumb' | 'hero';
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
};

/**
 * Social/YouTube thumbs often bake in dark pillarbox bars on the left/right.
 * We clip the frame and stretch-crop horizontally so only the photo shows.
 */
export function RecipeImage({
  uri,
  variant = 'thumb',
  style,
  borderRadius = variant === 'hero' ? 0 : 18,
}: RecipeImageProps) {
  // Heavy horizontal crop removes side bars; light vertical keeps the dish in frame.
  const scaleX = variant === 'hero' ? 1.55 : 1.45;
  const scaleY = variant === 'hero' ? 1.08 : 1.06;

  return (
    <View
      style={[
        styles.frame,
        { borderRadius },
        variant === 'hero' ? styles.hero : styles.thumb,
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={[styles.image, { transform: [{ scaleX }, { scaleY }] }]}
        contentFit="cover"
        contentPosition="center"
        transition={200}
        recyclingKey={uri}
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
  hero: {
    width: '100%',
    height: 260,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
});
