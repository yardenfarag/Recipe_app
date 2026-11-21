import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { MAX_PDF_BYTES } from '@shared/lib/supabase/extractRecipe';

/**
 * PDFs on mobile (PIN-72): picking one, reading one shared into Pinch, and telling a shared PDF from a shared photo.
 * The PDF goes to extract-recipe as is; the server reads its pages.
 */

export type RecipePdfRead = { ok: true; base64: string } | { ok: false; reason: 'too_large' | 'unreadable' };

/** What a share into Pinch carries, as Snap handles it: a photo, a PDF, or neither (a link or text). */
export type SharedRecipeFile = { kind: 'image'; path: string } | { kind: 'pdf'; path: string; size: number | null };

type ShareFile = { path: string; mimeType?: string | null; fileName?: string | null; size?: number | null };

function isPdf(file: ShareFile): boolean {
  const mime = (file.mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return true;
  // Some apps share a PDF as application/octet-stream; its name still says what it is.
  return /\.pdf$/i.test(file.fileName ?? '') || /\.pdf$/i.test(file.path);
}

/** The first photo or PDF in a share. A photo wins when there are both, as before PDFs were taken. */
export function sharedRecipeFile(files: readonly ShareFile[] | null | undefined): SharedRecipeFile | null {
  const list = files ?? [];
  const image = list.find((file) => (file.mimeType ?? '').startsWith('image/'));
  if (image) return { kind: 'image', path: image.path };
  const pdf = list.find(isPdf);
  if (pdf) return { kind: 'pdf', path: pdf.path, size: pdf.size ?? null };
  return null;
}

/** A share gives a plain path on some platforms; File wants a URI. */
function fileUri(pathOrUri: string): string {
  return pathOrUri.startsWith('/') ? `file://${pathOrUri}` : pathOrUri;
}

/**
 * Reads a PDF at a local path or URI as base64. One over the server's limit is turned away before it is read, so a
 * huge file never sits in memory.
 */
export async function readRecipePdf(pathOrUri: string, knownSize?: number | null): Promise<RecipePdfRead> {
  try {
    const file = new File(fileUri(pathOrUri));
    const size = knownSize ?? file.size;
    if (typeof size === 'number' && size > MAX_PDF_BYTES) return { ok: false, reason: 'too_large' };
    const base64 = await file.base64();
    if (!base64) return { ok: false, reason: 'unreadable' };
    // The size the file system reported may have been missing or stale.
    if (base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) return { ok: false, reason: 'too_large' };
    return { ok: true, base64 };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/** Opens the system file picker for one PDF and reads it. Null when the picker was closed. */
export async function pickRecipePdf(): Promise<RecipePdfRead | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return readRecipePdf(asset.uri, asset.size);
}
