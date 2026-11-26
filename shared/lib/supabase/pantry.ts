/**
 * PIN-181: the pantry's data. Saved items are the person's own rows, read and written directly under RLS
 * (`pantry_items`). Photos go through the scan-pantry function; a scan's results wait in `pantry_scan_photos`
 * until the list is saved. "Use your phone's camera" goes through photo-handoff.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import type {
  PantryAisle,
  PantryItem,
  PantryItemSource,
  PantryPlace,
  ScanItem,
  ScanPhoto,
} from '../../types/pantry';
import { supabase } from './client';

type PantryRow = {
  id: string;
  name: string;
  name_en: string;
  brand: string;
  place: string;
  aisle: string;
  source: string;
  added_at: string;
  last_seen_at: string;
};

const COLUMNS = 'id, name, name_en, brand, place, aisle, source, added_at, last_seen_at';

function toItem(row: PantryRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    brand: row.brand,
    place: row.place as PantryPlace,
    aisle: row.aisle as PantryAisle,
    source: row.source as PantryItemSource,
    addedAt: row.added_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function fetchPantryItems(): Promise<PantryItem[]> {
  const { data, error } = await supabase.from('pantry_items').select(COLUMNS).order('name');
  if (error) throw error;
  return ((data as PantryRow[] | null) ?? []).map(toItem);
}

export type NewPantryItem = {
  name: string;
  nameEn?: string;
  brand?: string;
  place: PantryPlace;
  aisle?: PantryAisle;
  source: PantryItemSource;
};

const clip = (value: string | undefined, max: number) => (value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/**
 * Adds items, or marks them as seen again when they are already there (one row per product and place). Returns the
 * saved rows.
 */
export async function upsertPantryItems(userId: string, items: NewPantryItem[]): Promise<PantryItem[]> {
  const now = new Date().toISOString();
  const rows = items
    .map((item) => ({
      user_id: userId,
      name: clip(item.name, 60),
      name_en: clip(item.nameEn, 60).toLowerCase(),
      brand: clip(item.brand, 40),
      place: item.place,
      aisle: item.aisle ?? 'other',
      source: item.source,
      last_seen_at: now,
    }))
    .filter((row) => row.name);
  if (rows.length === 0) return [];
  // The same product twice in one batch would make the upsert fail; keep the first.
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    const key = `${row.place}|${(row.name_en || row.name).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { data, error } = await supabase
    .from('pantry_items')
    .upsert(unique, { onConflict: 'user_id,place,name_key' })
    .select(COLUMNS);
  if (error) throw error;
  return ((data as PantryRow[] | null) ?? []).map(toItem);
}

export async function renamePantryItem(id: string, name: string): Promise<void> {
  // A new name drops the English one, which named the old product.
  const { error } = await supabase.from('pantry_items').update({ name: clip(name, 60), name_en: '' }).eq('id', id);
  if (error) throw error;
}

export async function movePantryItem(id: string, place: PantryPlace): Promise<void> {
  const { error } = await supabase.from('pantry_items').update({ place }).eq('id', id);
  if (error) throw error;
}

export async function deletePantryItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('pantry_items').delete().in('id', ids);
  if (error) throw error;
}

// ── Scans ────────────────────────────────────────────────────────────────────

export type ScanFailure = {
  status: 'failed';
  code: 'daily_limit' | 'invalid_photo' | 'scan_failed' | 'auth_required' | 'network' | string;
  message?: string;
};

async function failureFrom(error: unknown): Promise<ScanFailure> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { code?: string; message?: string };
      return { status: 'failed', code: body.code ?? 'scan_failed', message: body.message };
    } catch {
      // No JSON answer.
    }
    return { status: 'failed', code: 'scan_failed' };
  }
  return { status: 'failed', code: 'network' };
}

/** Reads one photo. The image is a JPEG, PNG or WebP as base64 (a data URL is fine). */
export async function scanPantryPhoto(input: {
  scanId: string;
  place: PantryPlace;
  language: string;
  imageBase64: string;
}): Promise<{ status: 'ok'; photo: ScanPhoto } | ScanFailure> {
  const { data, error } = await supabase.functions.invoke<{ status: 'ok'; photo: ScanPhoto }>('scan-pantry', {
    body: { scan_id: input.scanId, place: input.place, language: input.language, image_base64: input.imageBase64 },
  });
  if (error) return failureFrom(error);
  if (!data?.photo) return { status: 'failed', code: 'scan_failed' };
  return { status: 'ok', photo: data.photo };
}

type ScanPhotoRow = {
  id: string;
  scan_id: string;
  place: string;
  quality: string;
  items: unknown;
  truncated: boolean;
  from_phone: boolean;
  created_at: string;
};

/** The photos read so far in a scan: to resume it, and to pick up photos a phone sent. */
export async function fetchScanPhotos(scanId: string): Promise<ScanPhoto[]> {
  const { data, error } = await supabase
    .from('pantry_scan_photos')
    .select('id, scan_id, place, quality, items, truncated, from_phone, created_at')
    .eq('scan_id', scanId)
    .order('created_at');
  if (error) throw error;
  return ((data as ScanPhotoRow[] | null) ?? []).map((row) => ({
    id: row.id,
    scan_id: row.scan_id,
    place: row.place as PantryPlace,
    quality: row.quality as ScanPhoto['quality'],
    items: Array.isArray(row.items) ? (row.items as ScanItem[]) : [],
    truncated: row.truncated,
    from_phone: row.from_phone,
    created_at: row.created_at,
  }));
}

export async function deleteScanPhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('pantry_scan_photos').delete().in('id', ids);
  if (error) throw error;
}

/** Clears a scan's results once its list is saved or thrown away. */
export async function clearScan(scanId: string): Promise<void> {
  const { error } = await supabase.from('pantry_scan_photos').delete().eq('scan_id', scanId);
  if (error) throw error;
}

/**
 * Saves a reviewed scan: adds or refreshes the ticked items, removes the saved ones the person said are gone, and
 * clears the scan.
 */
export async function saveScan(
  userId: string,
  scanId: string,
  keep: NewPantryItem[],
  removeIds: string[],
): Promise<PantryItem[]> {
  const saved = await upsertPantryItems(userId, keep);
  await deletePantryItems(removeIds);
  await clearScan(scanId).catch(() => {
    // Left-over results are purged after a week; the list itself is saved.
  });
  return saved;
}

// ── Phone handoff (web) ─────────────────────────────────────────────────────

export type HandoffPurpose = 'pantry' | 'snap' | 'guess';
export type HandoffState = 'waiting' | 'connected' | 'photo_ready' | 'closed' | 'expired';
export type Handoff = { id: string; token: string; expiresAt: string };

async function invokeHandoff<T>(body: Record<string, unknown>): Promise<({ status: 'ok' } & T) | ScanFailure> {
  const { data, error } = await supabase.functions.invoke<{ status: 'ok' } & T>('photo-handoff', { body });
  if (error) return failureFrom(error);
  if (!data || data.status !== 'ok') return { status: 'failed', code: 'scan_failed' };
  return data;
}

/** A link the phone opens to send photos to this session. */
export async function createHandoff(input: {
  purpose: HandoffPurpose;
  scanId?: string;
  place?: PantryPlace;
  language: string;
}): Promise<Handoff | ScanFailure> {
  const result = await invokeHandoff<{ handoff: { id: string; token: string; expires_at: string } }>({
    action: 'create',
    purpose: input.purpose,
    scan_id: input.scanId,
    place: input.place,
    language: input.language,
  });
  if (result.status !== 'ok') return result;
  return { id: result.handoff.id, token: result.handoff.token, expiresAt: result.handoff.expires_at };
}

export async function handoffStatus(handoffId: string): Promise<HandoffState | null> {
  const result = await invokeHandoff<{ state: HandoffState }>({ action: 'status', handoff_id: handoffId });
  return result.status === 'ok' ? result.state : null;
}

/** The photo the phone sent for Snap or Guess, once. Null while it hasn't sent one. */
export async function takeHandoffPhoto(handoffId: string): Promise<{ imageBase64: string; mime: string } | null> {
  const result = await invokeHandoff<{ photo: { image_base64: string; mime: string } | null }>({
    action: 'take',
    handoff_id: handoffId,
  });
  if (result.status !== 'ok' || !result.photo) return null;
  return { imageBase64: result.photo.image_base64, mime: result.photo.mime };
}

export async function closeHandoff(handoffId: string): Promise<void> {
  await invokeHandoff({ action: 'close', handoff_id: handoffId });
}

/** The phone's side: what the link is for. No sign-in. */
export async function openHandoff(
  token: string,
): Promise<{ purpose: HandoffPurpose; place: PantryPlace | null; language: string; expiresAt: string } | ScanFailure> {
  const result = await invokeHandoff<{ purpose: HandoffPurpose; place: PantryPlace | null; language: string; expires_at: string }>({
    action: 'open',
    token,
  });
  if (result.status !== 'ok') return result;
  return { purpose: result.purpose, place: result.place, language: result.language, expiresAt: result.expires_at };
}

/** The phone's side: sends one photo. A pantry photo is read right away. */
export async function uploadHandoffPhoto(
  token: string,
  imageBase64: string,
  place?: PantryPlace,
): Promise<{ status: 'ok'; photo?: ScanPhoto; sent?: boolean } | ScanFailure> {
  return invokeHandoff<{ photo?: ScanPhoto; sent?: boolean }>({ action: 'upload', token, image_base64: imageBase64, place });
}

/** The phone's "I'm done": closes the link, and the computer's dialog closes with it. */
export async function finishHandoff(token: string): Promise<void> {
  await invokeHandoff({ action: 'finish', token });
}

/** The address a phone opens. The token rides in the fragment, so it never reaches a server log. */
export function handoffUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/app/phone#${token}`;
}

/** Reads the token from the phone page's address fragment. */
export function readHandoffToken(hash: string): string | null {
  const token = hash.replace(/^#/, '').trim();
  return /^[A-Za-z0-9_-]{32}$/.test(token) ? token : null;
}
