// PIN-181: one photo of a pantry scan, start to finish, for the signed-in app (scan-pantry) and for a phone
// sending photos to a web session (photo-handoff). Counts it against the owner's daily cap, reads it, keeps
// the items on the scan until the list is saved, and logs the cost. The photo itself is never stored.

import { withDailyAiUsage } from '../core/dailyAiUsage.ts';
import { HttpError } from '../core/httpError.ts';
import { type Db, toJson } from '../core/supabaseAdmin.ts';
import type { UsageEventInput } from '../core/usageLog.ts';
import { PANTRY_SCAN_DAILY_LIMIT } from '../llm/pricing.ts';
import { type PhotoMime, photoBytes } from './photoInput.ts';
import { PANTRY_PLACES, type PantryPlace, type PantryScanResult, scanPantryPhoto } from './pantryScan.ts';

/** The items as they are stored on the scan photo and sent to the apps. */
export type ScanItemJson = {
  name: string;
  name_en: string;
  brand: string;
  aisle: string;
  confidence: 'high' | 'low';
  container_unknown: boolean;
};

export type ScanPhotoJson = {
  /** Null for a photo that isn't a kitchen: nothing is kept for it. */
  id: string | null;
  scan_id: string;
  place: PantryPlace;
  quality: PantryScanResult['quality'];
  items: ScanItemJson[];
  truncated: boolean;
  from_phone: boolean;
  created_at: string;
  /** The same photo was already read in this scan: this is that earlier result, and nothing was charged. */
  duplicate?: boolean;
};

const PHOTO_ROW = 'id, scan_id, place, quality, items, truncated, from_phone, created_at';

type PhotoRow = {
  id: string;
  scan_id: string;
  place: string;
  quality: string;
  items: unknown;
  truncated: boolean;
  from_phone: boolean;
  created_at: string;
};

function fromRow(row: PhotoRow): ScanPhotoJson {
  return {
    id: row.id,
    scan_id: row.scan_id,
    place: row.place as PantryPlace,
    quality: row.quality as PantryScanResult['quality'],
    items: Array.isArray(row.items) ? (row.items as ScanItemJson[]) : [],
    truncated: row.truncated,
    from_phone: row.from_phone,
    created_at: row.created_at,
    duplicate: true,
  };
}

/** sha256 of the photo's bytes, hex. */
export async function photoHash(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', photoBytes(base64) as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** This scan's earlier result for the same photo, if it was already read. */
async function alreadyRead(admin: Db, userId: string, scanId: string, hash: string): Promise<ScanPhotoJson | null> {
  const { data, error } = await admin
    .from('pantry_scan_photos')
    .select(PHOTO_ROW)
    .eq('user_id', userId)
    .eq('scan_id', scanId)
    .eq('photo_hash', hash)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as PhotoRow) : null;
}

export const SUPPORTED_LANGUAGES = ['en', 'he', 'ar', 'ru', 'es'] as const;

export function parsePlace(raw: unknown): PantryPlace {
  if (typeof raw === 'string' && (PANTRY_PLACES as readonly string[]).includes(raw)) return raw as PantryPlace;
  throw new HttpError(400, 'invalid_place', 'Pick where this photo was taken.');
}

export function parseLanguage(raw: unknown): string {
  return typeof raw === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw) ? raw : 'en';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScanId(raw: unknown): string {
  if (typeof raw === 'string' && UUID.test(raw)) return raw.toLowerCase();
  throw new HttpError(400, 'invalid_scan', 'This scan has expired. Start again.');
}

export const scanDailyLimit = new HttpError(
  429,
  'daily_limit',
  "You've scanned a lot today. Try again tomorrow.",
  { limit: PANTRY_SCAN_DAILY_LIMIT },
);
export const scanFailed = new HttpError(502, 'scan_failed', "Couldn't read this photo. Try again.");
const meteringError = new HttpError(500, 'metering_error', 'Something went wrong. Please try again.');

/** Thrown inside the daily-cap reservation so it gives the use back; caught right outside it. */
class NotKitchen extends Error {}

/** The same photo was saved by a parallel request: its result is returned and this use given back. */
class AlreadyRead extends Error {
  constructor(readonly photo: ScanPhotoJson) {
    super('already read');
  }
}

export function toItemJson(result: PantryScanResult): ScanItemJson[] {
  return result.items.map((item) => ({
    name: item.name,
    name_en: item.nameEn,
    brand: item.brand,
    aisle: item.aisle,
    confidence: item.confidence,
    container_unknown: item.containerUnknown,
  }));
}

export interface ScanOnePhotoInput {
  admin: Db;
  userId: string;
  scanId: string;
  place: PantryPlace;
  language: string;
  photo: { base64: string; mime: PhotoMime };
  fromPhone: boolean;
  logUsage(event: Omit<UsageEventInput, 'userId'>): Promise<unknown>;
  /** Replaced in tests. */
  scan?: typeof scanPantryPhoto;
}

export async function scanOnePhoto(input: ScanOnePhotoInput): Promise<ScanPhotoJson> {
  const scan = input.scan ?? scanPantryPhoto;
  const now = new Date().toISOString();
  const metadata = { place: input.place, language: input.language, from_phone: input.fromPhone };
  // The same photo twice in one scan (picked again, or sent from both the phone and the computer) is read once.
  const hash = await photoHash(input.photo.base64);
  const earlier = await alreadyRead(input.admin, input.userId, input.scanId, hash);
  if (earlier) return earlier;
  let reserved = false;
  try {
    return await withDailyAiUsage(
      input.admin,
      input.userId,
      'pantry_scan',
      PANTRY_SCAN_DAILY_LIMIT,
      async () => {
        reserved = true;
        let result: Awaited<ReturnType<typeof scanPantryPhoto>>;
        try {
          result = await scan({
            imageBase64: input.photo.base64,
            mimeType: input.photo.mime,
            place: input.place,
            language: input.language,
          });
        } catch (error) {
          console.error('[pantry] scan failed', error);
          await input.logUsage({
            action: 'pantry_scan',
            status: 'error',
            tokensCharged: 0,
            metadata,
            errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
          });
          throw scanFailed;
        }
        await input.logUsage({
          action: 'pantry_scan',
          status: result.quality === 'not_kitchen' ? 'not_kitchen' : 'ok',
          usages: result.usage ? [result.usage] : [],
          tokensCharged: 0,
          metadata: { ...metadata, quality: result.quality, item_count: result.items.length },
        });
        if (result.quality === 'not_kitchen') throw new NotKitchen();

        const items = toItemJson(result);
        const { data, error } = await input.admin
          .from('pantry_scan_photos')
          .insert({
            user_id: input.userId,
            scan_id: input.scanId,
            place: input.place,
            quality: result.quality,
            items: toJson(items),
            truncated: result.truncated,
            from_phone: input.fromPhone,
            photo_hash: hash,
          })
          .select('id, created_at')
          .single();
        if (error?.code === '23505') {
          // Read twice at the same moment: keep the first, and give this use back.
          const first = await alreadyRead(input.admin, input.userId, input.scanId, hash);
          if (first) throw new AlreadyRead(first);
        }
        if (error || !data) {
          console.error('[pantry] save scan photo', error);
          throw scanFailed;
        }
        return {
          id: data.id,
          scan_id: input.scanId,
          place: input.place,
          quality: result.quality,
          items,
          truncated: result.truncated,
          from_phone: input.fromPhone,
          created_at: data.created_at,
        };
      },
      {
        limited: scanDailyLimit,
        meteringError,
        onLimited: () => input.logUsage({ action: 'pantry_scan', status: 'daily_limit', tokensCharged: 0, metadata }),
      },
    );
  } catch (error) {
    if (reserved && error instanceof AlreadyRead) return error.photo;
    // The use has been given back by now: a photo of the dog doesn't count.
    if (reserved && error instanceof NotKitchen) {
      return {
        id: null,
        scan_id: input.scanId,
        place: input.place,
        quality: 'not_kitchen',
        items: [],
        truncated: false,
        from_phone: input.fromPhone,
        created_at: now,
      };
    }
    throw error;
  }
}
