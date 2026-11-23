import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '@shared/lib/supabase/client';
import { IMPORTED_IDS_KEY, mergeImportedIds } from '@shared/lib/whatsappImport';

/**
 * The device side of the WhatsApp import (ADR 032): reading the picked or shared export, unpacked photos in the
 * cache folder, and the ids already imported. The chat itself is read by shared/lib/whatsappImport.
 */

/** Reads a file at a local or content URI. */
export async function readChatFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** The size the file system reports, or null when it can't say. */
export function chatFileSize(uri: string): number | null {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' && size > 0 ? size : null;
  } catch {
    return null;
  }
}

function photoDirectory(): Directory {
  return new Directory(Paths.cache, 'whatsapp-import');
}

/** Removes the photos unpacked from an earlier chat. Each chat's photo names start from 00000001 again. */
export function clearChatPhotoCache(): void {
  try {
    const dir = photoDirectory();
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('[whatsapp-import] photo cache cleanup failed', error);
  }
}

function safeName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || 'photo.jpg';
}

/**
 * Writes one photo from the chat to the cache folder and returns its URI, for <Image> and for the photo prep
 * (resize and compress) that Snap uses. Written once per chat: a second call returns the same file.
 */
export function cachedChatPhotoUri(fileName: string, readBytes: () => Uint8Array | null): string | null {
  try {
    const dir = photoDirectory();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, safeName(fileName));
    if (file.exists && file.size > 0) return file.uri;
    const bytes = readBytes();
    if (!bytes || bytes.length === 0) return null;
    if (!file.exists) file.create();
    file.write(bytes);
    return file.uri;
  } catch (error) {
    console.warn('[whatsapp-import] photo unpack failed', error);
    return null;
  }
}

/** Ids of chat items imported before (IMPORTED_IDS_KEY), so the review list marks them. */
export async function loadImportedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(IMPORTED_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Adds the ids just imported to the stored list. */
export async function rememberImportedIds(added: readonly string[]): Promise<void> {
  if (added.length === 0) return;
  try {
    const previous = await loadImportedIds();
    await AsyncStorage.setItem(IMPORTED_IDS_KEY, JSON.stringify(mergeImportedIds(previous, added)));
  } catch (error) {
    console.warn('[whatsapp-import] remembering imported ids failed', error);
  }
}

const SOURCE_URL_PAGE = 1000;
const SOURCE_URL_MAX = 10_000;

/** Source links of the recipes in the cook's Library, so links already saved are marked and not charged. */
export async function fetchSavedSourceUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (let offset = 0; offset < SOURCE_URL_MAX; offset += SOURCE_URL_PAGE) {
    const { data, error } = await supabase
      .from('recipes')
      .select('original_url')
      .not('original_url', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + SOURCE_URL_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { original_url: string | null }[];
    for (const row of rows) {
      if (row.original_url?.trim()) urls.push(row.original_url.trim());
    }
    if (rows.length < SOURCE_URL_PAGE) break;
  }
  return urls;
}
