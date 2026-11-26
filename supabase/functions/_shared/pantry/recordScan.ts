// PIN-181: one photo of a pantry scan, start to finish, for the signed-in app (scan-pantry) and for a phone
// sending photos to a web session (photo-handoff). Counts it against the owner's daily cap, reads it, keeps
// the items on the scan until the list is saved, and logs the cost. The photo itself is never stored.

import { withDailyAiUsage } from '../core/dailyAiUsage.ts';
import { HttpError } from '../core/httpError.ts';
import { type Db, toJson } from '../core/supabaseAdmin.ts';
import type { UsageEventInput } from '../core/usageLog.ts';
import { PANTRY_SCAN_DAILY_LIMIT } from '../llm/pricing.ts';
import type { PhotoMime } from './photoInput.ts';
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
};

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
          })
          .select('id, created_at')
          .single();
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
