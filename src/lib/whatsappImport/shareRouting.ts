/**
 * Which OS shares into Pinch are WhatsApp chat exports (ADR 032). Those open the WhatsApp import screen instead of
 * Snap. Everything else (a link, shared text, a photo, a PDF) still goes to Snap as before (ADR 010).
 */

/** A file in a share, as expo-share-intent hands it over. */
export type ShareFileLike = {
  path?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

/** The chat export to open, with a URI expo-file-system can read. */
export type SharedChatExport = { uri: string; name: string; size: number | null };

const ZIP_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-zip']);

function baseName(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  const last = clean.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** A share gives a plain path on some platforms; File wants a URI. */
export function shareFileUri(pathOrUri: string): string {
  return pathOrUri.startsWith('/') ? `file://${pathOrUri}` : pathOrUri;
}

function fileName(file: ShareFileLike): string {
  return (file.fileName?.trim() || baseName(file.path ?? '')).trim();
}

/**
 * True for the files WhatsApp's Export Chat makes: any .zip (iOS always zips; Android zips when media is attached),
 * and a .txt named like a chat ("WhatsApp Chat with Family.txt", "_chat.txt"). A .zip that isn't a chat is turned
 * away by the import screen, which reads it ("That doesn't look like a WhatsApp chat"); Snap can't read a .zip at
 * all, so nothing that used to work is lost.
 */
export function isWhatsAppExportFile(file: ShareFileLike): boolean {
  const name = fileName(file).toLowerCase();
  const mime = (file.mimeType ?? '').toLowerCase();
  if (ZIP_MIME_TYPES.has(mime) || name.endsWith('.zip')) return true;
  if (!name.endsWith('.txt')) return false;
  return name === '_chat.txt' || name.includes('whatsapp');
}

/** The WhatsApp chat export in a share, or null when the share is for Snap. */
export function whatsAppExportInShare(
  files: readonly ShareFileLike[] | null | undefined,
): SharedChatExport | null {
  const file = (files ?? []).find((candidate) => candidate.path && isWhatsAppExportFile(candidate));
  if (!file?.path) return null;
  return { uri: shareFileUri(file.path), name: fileName(file) || '_chat.txt', size: file.size ?? null };
}
