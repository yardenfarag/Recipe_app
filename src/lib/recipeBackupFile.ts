import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type RecipeBackupSaveResult = 'shared' | 'downloaded';

/** Native: write the file to the cache and open the share sheet. Web: download it. */
export async function saveRecipeBackupFile(
  contents: string,
  fileName: string,
): Promise<RecipeBackupSaveResult> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'downloaded';
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: fileName,
  });
  return 'shared';
}

/** Lets the person choose a backup file and returns its text, or null when they cancel. */
export async function pickRecipeBackupFile(): Promise<string | null> {
  if (Platform.OS === 'web') return pickFileOnWeb();

  try {
    const picked = await File.pickFileAsync();
    const file = Array.isArray(picked) ? picked[0] : picked;
    return file ? await file.text() : null;
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return null;
    throw err;
  }
}

function pickFileOnWeb(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
