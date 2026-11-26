// PIN-181: "Use your phone's camera" on the web. The computer makes a short-lived link (shown as a QR code); the
// phone opens it in its browser, with no app and no sign-in, and sends photos to that one session.
//
// The link's token is the only key. It can add photos to one scan, or hand one photo to Snap or Guess the recipe,
// and nothing else: it reads nothing from the account. Only its sha256 is stored. A Snap or Guess photo waits in
// the handoff row until the computer takes it (then it is deleted), or the purge drops it after 15 minutes.

import { HttpError } from '../core/httpError.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import { bytesToBase64, type PhotoMime, photoBytes } from './photoInput.ts';
import type { PantryPlace } from './pantryScan.ts';

export const HANDOFF_PURPOSES = ['pantry', 'snap', 'guess'] as const;
export type HandoffPurpose = (typeof HANDOFF_PURPOSES)[number];

export const HANDOFF_TTL_MS = 15 * 60 * 1000;
/** Photos one link may send. A big kitchen is a dozen; this only stops a runaway page. */
export const MAX_UPLOADS_PER_HANDOFF = 40;
/** Links one person may make in an hour. */
export const MAX_HANDOFFS_PER_HOUR = 20;

export const handoffGone = new HttpError(410, 'handoff_expired', 'This link has expired. Make a new one on your computer.');
export const handoffNotFound = new HttpError(404, 'handoff_not_found', 'This link has expired. Make a new one on your computer.');
export const tooManyUploads = new HttpError(429, 'too_many_photos', "That's a lot of photos for one link. Make a new one on your computer.");
export const tooManyHandoffs = new HttpError(429, 'too_many_links', 'Too many links in a short time. Try again in a few minutes.');

/** 24 random bytes as base64url: 32 characters, unguessable. */
export function newHandoffToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isHandoffToken(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{32}$/.test(raw);
}

export async function hashHandoffToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type HandoffRow = {
  id: string;
  user_id: string;
  purpose: HandoffPurpose;
  scan_id: string | null;
  place: PantryPlace | null;
  language: string;
  expires_at: string;
  connected_at: string | null;
  closed_at: string | null;
  photo_at: string | null;
};

export type HandoffState = 'waiting' | 'connected' | 'photo_ready' | 'closed' | 'expired';

/** What the computer shows while it waits. Pure. */
export function handoffState(row: HandoffRow, now = Date.now()): HandoffState {
  if (row.closed_at) return 'closed';
  if (Date.parse(row.expires_at) <= now) return 'expired';
  if (row.photo_at) return 'photo_ready';
  return row.connected_at ? 'connected' : 'waiting';
}

const COLUMNS = 'id, user_id, purpose, scan_id, place, language, expires_at, connected_at, closed_at, photo_at';

/** The open handoff for a phone's token, or `handoff_expired`. */
export async function openHandoffByToken(admin: Db, token: string, now = Date.now()): Promise<HandoffRow> {
  const { data, error } = await admin
    .from('photo_handoffs')
    .select(COLUMNS)
    .eq('token_hash', await hashHandoffToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw handoffNotFound;
  const row = data as HandoffRow;
  const state = handoffState(row, now);
  if (state === 'closed' || state === 'expired') throw handoffGone;
  return row;
}

/** The caller's own handoff, or `handoff_not_found`. */
export async function ownHandoff(admin: Db, userId: string, id: unknown): Promise<HandoffRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw handoffNotFound;
  const { data, error } = await admin
    .from('photo_handoffs')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw handoffNotFound;
  return data as HandoffRow;
}

/** bytea goes over PostgREST as a `\x…` hex string. */
export function toByteaHex(bytes: Uint8Array): string {
  let hex = '\\x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function fromByteaHex(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Keeps a Snap or Guess photo for the computer. A newer photo replaces one it hasn't taken yet. */
export async function parkPhoto(admin: Db, handoffId: string, photo: { base64: string; mime: PhotoMime }) {
  const { error } = await admin
    .from('photo_handoffs')
    .update({ photo: toByteaHex(photoBytes(photo.base64)), photo_mime: photo.mime, photo_at: new Date().toISOString() })
    .eq('id', handoffId);
  if (error) throw error;
}

/** Hands the waiting photo to the computer and deletes it. Null while the phone hasn't sent one. */
export async function takePhoto(admin: Db, row: HandoffRow): Promise<{ image_base64: string; mime: string } | null> {
  if (!row.photo_at) return null;
  const { data, error } = await admin.from('photo_handoffs').select('photo, photo_mime').eq('id', row.id).single();
  if (error) throw error;
  if (!data?.photo) return null;
  const { error: clearError } = await admin
    .from('photo_handoffs')
    .update({ photo: null, photo_mime: null, photo_at: null, closed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (clearError) throw clearError;
  return { image_base64: bytesToBase64(fromByteaHex(String(data.photo))), mime: data.photo_mime ?? 'image/jpeg' };
}
