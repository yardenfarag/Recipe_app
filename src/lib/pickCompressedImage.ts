import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export type CompressedRecipeImage = {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
};

const MAX_BASE64_CHARS = 1_400_000;

async function compressImageUri(uri: string): Promise<CompressedRecipeImage | null> {
  const attempts: { maxWidth: number; compress: number }[] = [
    { maxWidth: 1280, compress: 0.55 },
    { maxWidth: 960, compress: 0.35 },
  ];

  let sourceUri = uri;
  let sourceWidth = Number.POSITIVE_INFINITY;
  try {
    const probe = await ImageManipulator.manipulateAsync(uri, []);
    sourceUri = probe.uri;
    if (probe.width > 0) sourceWidth = probe.width;
  } catch {
    // Use the original URI if a probe resize is not available.
  }

  for (const attempt of attempts) {
    const actions =
      sourceWidth > attempt.maxWidth ? [{ resize: { width: attempt.maxWidth } }] : [];
    const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
      compress: attempt.compress,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (result.base64 && result.base64.length <= MAX_BASE64_CHARS) {
      return { base64: result.base64, mimeType: 'image/jpeg' };
    }
  }
  return null;
}

export async function pickCompressedRecipeImage(
  source: 'camera' | 'library',
  copy: {
    permissionTitle: string;
    permissionCamera: string;
    permissionLibrary: string;
    readFailedTitle: string;
    readFailedBody: string;
  },
): Promise<CompressedRecipeImage | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    Alert.alert(
      copy.permissionTitle,
      source === 'camera' ? copy.permissionCamera : copy.permissionLibrary,
    );
    return null;
  }

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (result.canceled || !result.assets[0]?.uri) return null;

  try {
    const compressed = await compressImageUri(result.assets[0].uri);
    if (!compressed) {
      Alert.alert(copy.readFailedTitle, copy.readFailedBody);
      return null;
    }
    return compressed;
  } catch {
    Alert.alert(copy.readFailedTitle, copy.readFailedBody);
    return null;
  }
}

export async function fileUriToBase64(uri: string): Promise<CompressedRecipeImage | null> {
  try {
    return await compressImageUri(uri);
  } catch {
    return null;
  }
}

export function isWebFilePicker(): boolean {
  return Platform.OS === 'web';
}
