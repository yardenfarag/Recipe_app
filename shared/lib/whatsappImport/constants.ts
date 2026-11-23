/** Largest chat export Pinch reads (bytes). Bigger files throw WhatsAppImportError('too_big'). */
export const MAX_CHAT_FILE_BYTES = 250 * 1024 * 1024;

/** Storage key under which each app keeps the ids of candidates already imported (a JSON string array). */
export const IMPORTED_IDS_KEY = 'pinch.whatsappImport.importedIds';

/** How many imported ids `mergeImportedIds` keeps. */
export const MAX_IMPORTED_IDS = 5000;

/** Image files in a chat .zip that can become photo candidates, by extension. */
export const PHOTO_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The MIME type of an image file name Pinch can import, else null. */
export function photoMime(fileName: string): string | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && PHOTO_MIME_BY_EXTENSION[ext]) || null;
}
