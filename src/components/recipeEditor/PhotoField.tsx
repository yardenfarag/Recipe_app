import { Image } from 'expo-image';
import { Alert, Platform, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

import { useThemePreference } from '@/hooks/useThemePreference';
import { pickCompressedRecipeImage } from '@/lib/pickCompressedImage';
import type { EditorPhoto } from '@/lib/recipeEditor';
import { recipeImageSource } from '@/lib/recipeImageSource';

type PhotoFieldProps = {
  photo: EditorPhoto;
  /** The saved photo, shown while `photo` is keep. */
  imageUrl: string | null;
  onChange: (photo: EditorPhoto) => void;
};

/** Replace or add a photo from the camera or library, or remove it. Pinch never makes one up. */
export function PhotoField({ photo, imageUrl, onChange }: PhotoFieldProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();

  const source =
    photo.kind === 'replace'
      ? { uri: `data:${photo.mimeType};base64,${photo.base64}` }
      : photo.kind === 'keep' && imageUrl
        ? recipeImageSource(imageUrl)
        : null;

  async function pick(from: 'camera' | 'library') {
    const image = await pickCompressedRecipeImage(from, {
      permissionTitle: t('settings.permissionNeededTitle'),
      permissionCamera: t('settings.permissionCamera'),
      permissionLibrary: t('settings.permissionLibrary'),
      readFailedTitle: t('settings.imageReadFailedTitle'),
      readFailedBody: t('snap.photoTooLarge'),
    });
    if (image) onChange({ kind: 'replace', base64: image.base64, mimeType: image.mimeType });
  }

  function choose() {
    if (Platform.OS === 'web') {
      void pick('library');
      return;
    }
    Alert.alert(source ? t('recipeEditor.photo.replace') : t('recipeEditor.photo.add'), undefined, [
      { text: t('recipeEditor.photo.camera'), onPress: () => void pick('camera') },
      { text: t('recipeEditor.photo.library'), onPress: () => void pick('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View className="gap-2">
      {source ? (
        <Image
          source={source}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: colors.primarySoft }}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Pressable trackId={source ? 'recipe_editor.photo.replace' : 'recipe_editor.photo.add'}
          onPress={choose}
          accessibilityRole="button"
          className="min-h-[44px] flex-row items-center justify-center rounded-2xl px-4 active:opacity-80"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Text className="text-sm font-semibold" style={{ color: colors.text }}>
            {source ? t('recipeEditor.photo.replace') : t('recipeEditor.photo.add')}
          </Text>
        </Pressable>
        {source ? (
          <Pressable trackId="recipe_editor.photo.remove"
            onPress={() => onChange(imageUrl ? { kind: 'remove' } : { kind: 'keep' })}
            accessibilityRole="button"
            className="min-h-[44px] flex-row items-center justify-center rounded-2xl border px-4 active:opacity-80"
            style={{ borderColor: colors.border }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.danger }}>
              {t('recipeEditor.photo.remove')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
