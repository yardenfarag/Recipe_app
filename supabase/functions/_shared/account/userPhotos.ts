// Removing a deleted account's Snap and Guess photos from Storage.
//
// Photos live at `photo/<user id>/<file>`, and that folder is the only thing known to be the
// user's. A recipe's image_url proves nothing: the app can set it to any URL, and a claimed share
// copies the sharer's photo URL into the claimer's recipe. Deleting "every photo my recipes point
// at" therefore let one account delete another's photos (PIN-153).
import type { Db } from '../core/supabaseAdmin.ts';

export const THUMBNAIL_BUCKET = 'recipe-thumbnails';
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

/**
 * The storage path of a photo uploaded before photos had per-user folders (`photo/<file>`), or
 * null for anything else: another bucket, another folder, or a file inside someone's own folder.
 */
export function legacyPhotoPath(imageUrl: string | null | undefined): string | null {
  const url = typeof imageUrl === 'string' ? imageUrl : '';
  const marker = `/${THUMBNAIL_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const segments = path.split('/');
  if (segments.length !== 2 || segments[0] !== 'photo') return null;
  const file = segments[1];
  if (!file || file === '.' || file === '..') return null;
  return path;
}

/** Every file in `photo/<user id>/`, a page at a time. */
async function ownFolderPaths(admin: Db, userId: string): Promise<string[]> {
  const paths: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin.storage
      .from(THUMBNAIL_BUCKET)
      .list(`photo/${userId}`, { limit: PAGE_SIZE, offset: page * PAGE_SIZE, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      console.error('Photo list failed:', error);
      break;
    }
    for (const file of data ?? []) paths.push(`photo/${userId}/${file.name}`);
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return paths;
}

/**
 * Old uploads sit directly under `photo/`, with no owner in the path. They're found through the
 * user's recipes and removed only when no other account's recipe uses the same file.
 */
async function legacyPaths(admin: Db, userId: string): Promise<string[]> {
  const { data: recipes, error } = await admin
    .from('recipes')
    .select('image_url')
    .eq('user_id', userId)
    .like('image_url', `%/${THUMBNAIL_BUCKET}/photo/%`);
  if (error) {
    console.error('Photo recipe lookup failed:', error);
    return [];
  }
  const candidates = new Set<string>();
  for (const row of recipes ?? []) {
    const path = legacyPhotoPath(row.image_url);
    if (path) candidates.add(path);
  }

  const mine: string[] = [];
  for (const path of candidates) {
    const { data: others, error: othersError } = await admin
      .from('recipes')
      .select('id')
      .neq('user_id', userId)
      .like('image_url', `%/${THUMBNAIL_BUCKET}/${path}%`)
      .limit(1);
    // Unsure means keep: a leftover file is better than deleting someone else's photo.
    if (othersError) {
      console.error('Photo owner check failed:', othersError);
      continue;
    }
    if ((others ?? []).length === 0) mine.push(path);
  }
  return mine;
}

/** Best effort: a failure is logged and the account deletion goes on. */
export async function removeUserPhotos(admin: Db, userId: string): Promise<void> {
  try {
    const paths = [...new Set([...(await ownFolderPaths(admin, userId)), ...(await legacyPaths(admin, userId))])];
    for (let i = 0; i < paths.length; i += PAGE_SIZE) {
      const { error } = await admin.storage.from(THUMBNAIL_BUCKET).remove(paths.slice(i, i + PAGE_SIZE));
      if (error) console.error('Photo remove failed:', error);
    }
  } catch (err) {
    console.error('Photo cleanup error:', err);
  }
}
