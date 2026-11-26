// PIN-181: the photo in a pantry scan or phone handoff request. The type comes from the file's first bytes,
// not from what the client says it is (security audit, docs/security/2026-11-audit.md).

import { HttpError } from '../core/httpError.ts';

/** Base64 characters. The apps send 2048px JPEGs of about 0.4–1 MB (1.4M characters at most). */
export const MAX_PHOTO_BASE64_CHARS = 2_000_000;
/** Body cap for a request that carries one photo and a few short fields. */
export const MAX_PHOTO_BODY_BYTES = 2_100_000;
/** Below this the "photo" is a few hundred pixels at most: too small to read a label. */
const MIN_PHOTO_BASE64_CHARS = 4_000;

export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const invalidPhoto = new HttpError(400, 'invalid_photo', "Couldn't read this photo. Try another one.");

/** The image type from its first bytes, or null when it isn't a JPEG, PNG or WebP. */
export function sniffPhotoMime(base64: string): PhotoMime | null {
  let head: string;
  try {
    head = atob(base64.slice(0, 24));
  } catch {
    return null;
  }
  const byte = (i: number) => head.charCodeAt(i);
  if (byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff) return 'image/jpeg';
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'image/png';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** A photo as raw base64 or a data URL, checked. Throws `invalid_photo` (400). */
export function parsePhoto(raw: unknown): { base64: string; mime: PhotoMime } {
  if (typeof raw !== 'string') throw invalidPhoto;
  const trimmed = raw.trim();
  const base64 = (trimmed.match(/^data:[^;,]*;base64,(.*)$/s)?.[1] ?? trimmed).replace(/\s/g, '');
  if (base64.length < MIN_PHOTO_BASE64_CHARS || base64.length > MAX_PHOTO_BASE64_CHARS) throw invalidPhoto;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalidPhoto;
  const mime = sniffPhotoMime(base64);
  if (!mime) throw invalidPhoto;
  return { base64, mime };
}

/** Bytes of a checked base64 photo, for storing it. */
export function photoBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Base64 of stored bytes, chunked so a 1 MB photo doesn't overflow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
