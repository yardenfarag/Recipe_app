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

// ── Pantry photos (PIN-181) ─────────────────────────────────────────────────
// A shelf of jars needs sharper photos than a recipe card: labels are small. The server refuses more than
// 2,000,000 base64 characters, so stay a little under it.

const PANTRY_MAX_BASE64_CHARS = 1_900_000;
const PANTRY_ATTEMPTS: { maxEdge: number; compress: number }[] = [
  { maxEdge: 2048, compress: 0.8 },
  { maxEdge: 1600, compress: 0.7 },
  { maxEdge: 1280, compress: 0.6 },
];

export type CompressedPantryPhoto = {
  /** The compressed file on the device, for the thumbnail. */
  uri: string;
  base64: string;
};

/** Shrinks a pantry photo to 2048 px on its long edge (stepping down if it is still too big), as JPEG. */
export async function compressPantryPhoto(uri: string): Promise<CompressedPantryPhoto | null> {
  try {
    let sourceUri = uri;
    let width = 0;
    let height = 0;
    try {
      const probe = await ImageManipulator.manipulateAsync(uri, []);
      sourceUri = probe.uri;
      width = probe.width;
      height = probe.height;
    } catch {
      // Use the original URI if a probe is not available.
    }
    for (const attempt of PANTRY_ATTEMPTS) {
      const longEdge = Math.max(width, height);
      const actions =
        longEdge === 0 || longEdge > attempt.maxEdge
          ? [{ resize: width >= height ? { width: attempt.maxEdge } : { height: attempt.maxEdge } }]
          : [];
      const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
        compress: attempt.compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (result.base64 && result.base64.length <= PANTRY_MAX_BASE64_CHARS) {
        return { uri: result.uri, base64: result.base64 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Asks for permission and opens the camera (one photo) or the library (several at once). Returns the picked files'
 * URIs, or null when cancelled or not allowed. Compress each with `compressPantryPhoto`.
 */
export async function pickPantryPhotoUris(
  source: 'camera' | 'library',
  copy: { permissionTitle: string; permissionCamera: string; permissionLibrary: string },
): Promise<string[] | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(copy.permissionTitle, source === 'camera' ? copy.permissionCamera : copy.permissionLibrary);
    return null;
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          allowsMultipleSelection: true,
          selectionLimit: 20,
          orderedSelection: true,
          quality: 1,
        });
  if (result.canceled) return null;
  const uris = result.assets.map((asset) => asset.uri).filter(Boolean);
  return uris.length > 0 ? uris : null;
}

export function isWebFilePicker(): boolean {
  return Platform.OS === 'web';
}
