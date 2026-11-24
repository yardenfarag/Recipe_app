import { HttpError } from '../core/httpError.ts';
import type { FridgeCatalogItem } from './fridgeMatch.ts';

export const MAX_FRIDGE_MATCH_BODY_BYTES = 2_200_000;
const MAX_CATALOG = 80;
const MAX_TITLE = 120;

interface RequestBody {
  image_base64?: string;
  imageBase64?: string;
  image_mime?: string;
  guest_install_id?: string;
  guestInstallId?: string;
  catalog?: FridgeCatalogItem[];
}

export interface FridgeMatchRequest {
  imageBase64: string;
  imageMime: string;
  /** Empty when no row was usable; the function answers `empty_library` for it. */
  catalog: FridgeCatalogItem[];
  guestInstallId: string | null;
}

/**
 * match-fridge's request: `{ image_base64, catalog, guest_install_id? }`, checked and trimmed. A bad image gets the
 * old `{ error }` 400. Like the code it came from, a body that isn't an object (`null`, say) throws a TypeError,
 * which is a 500.
 */
export function parseFridgeMatchRequest(raw: unknown): FridgeMatchRequest {
  const body = raw as RequestBody;

  const rawImage = body.image_base64 ?? body.imageBase64;
  let imageBase64: string | null = null;
  let imageMime = 'image/jpeg';
  if (typeof rawImage === 'string' && rawImage.trim().length > 80) {
    const trimmed = rawImage.trim();
    const dataUrl = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrl) {
      imageMime = dataUrl[1];
      imageBase64 = dataUrl[2];
    } else {
      imageBase64 = trimmed.replace(/\s/g, '');
      if (typeof body.image_mime === 'string' && body.image_mime.startsWith('image/')) {
        imageMime = body.image_mime;
      }
    }
  }
  if (!imageBase64 || imageBase64.length > 2_000_000) {
    throw HttpError.legacy(400, 'Missing or too-large image_base64');
  }

  const catalog = sanitizeCatalog(body.catalog);

  let guestInstallId: string | null = null;
  const rawInstall = body.guest_install_id ?? body.guestInstallId;
  if (typeof rawInstall === 'string' && rawInstall.trim().length >= 8) {
    guestInstallId = rawInstall.trim().slice(0, 128);
  }

  return { imageBase64, imageMime, catalog, guestInstallId };
}

function sanitizeCatalog(raw: FridgeCatalogItem[] | undefined): FridgeCatalogItem[] {
  if (!Array.isArray(raw)) return [];
  const dropIngredients = raw.length > MAX_CATALOG;
  return raw.slice(0, MAX_CATALOG).flatMap((row) => {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) return [];
    if (typeof row.title !== 'string' || !row.title.trim()) return [];
    const item: FridgeCatalogItem = {
      id: row.id.trim().slice(0, 80),
      title: row.title.trim().slice(0, MAX_TITLE),
    };
    if (!dropIngredients && Array.isArray(row.ingredientNames)) {
      item.ingredientNames = row.ingredientNames
        .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
        .map((name) => name.trim().slice(0, 60))
        .slice(0, 12);
    }
    if (Array.isArray(row.tags)) {
      item.tags = row.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim().toLowerCase().slice(0, 40))
        .slice(0, 6);
    }
    if (typeof row.time === 'number' && Number.isFinite(row.time) && row.time > 0) {
      item.time = Math.round(row.time);
    }
    return [item];
  });
}
