import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { foodAvatarIdFrom, foodAvatarSvg, isFoodAvatarValue, type FoodAvatarId } from '@shared/lib/foodAvatars';

import { useThemePreference } from '@/hooks/useThemePreference';

/** A food avatar's drawing, square. Clip it to a circle in the parent. */
export function FoodAvatarArt({ id, size }: { id: FoodAvatarId; size: number }) {
  return <SvgXml xml={foodAvatarSvg(id)} width={size} height={size} />;
}

/** The profile picture: a chosen food avatar, an uploaded photo, or a person outline when there is none. */
export function ProfileAvatar({ url, size }: { url: string | null; size: number }) {
  const { colors } = useThemePreference();
  const food = foodAvatarIdFrom(url);
  // A food avatar from a newer version isn't a URL either: show the outline rather than try to load it.
  const photo = url && !isFoodAvatarValue(url) ? url : null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.backgroundElement,
      }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {food ? (
        <FoodAvatarArt id={food} size={size} />
      ) : photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: size, height: size, backgroundColor: colors.backgroundElement }}
          contentFit="cover"
          contentPosition="center"
          transition={200}
        />
      ) : (
        <Ionicons name="person" size={Math.round(size * 0.43)} color={colors.textSecondary} />
      )}
    </View>
  );
}
