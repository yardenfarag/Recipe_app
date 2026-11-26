/** PIN-181: the pantry, filled from photos of the fridge, freezer and cupboards. */

export const PANTRY_PLACES = ['fridge', 'freezer', 'cupboard', 'other'] as const;
export type PantryPlace = (typeof PANTRY_PLACES)[number];

export const PANTRY_AISLES = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'other',
] as const;
export type PantryAisle = (typeof PANTRY_AISLES)[number];

export type PantryItemSource = 'scan' | 'manual' | 'shopping_list';

/** A saved pantry row (`public.pantry_items`). */
export type PantryItem = {
  id: string;
  /** In the app language at the time it was added. */
  name: string;
  /** Plain English name from a scan; '' for items typed by hand. */
  nameEn: string;
  brand: string;
  place: PantryPlace;
  aisle: PantryAisle;
  source: PantryItemSource;
  addedAt: string;
  lastSeenAt: string;
};

export type PhotoQuality = 'ok' | 'too_dark' | 'blurry' | 'too_far' | 'not_kitchen';

/** One item read from a photo, as scan-pantry returns it. */
export type ScanItem = {
  name: string;
  name_en: string;
  brand: string;
  aisle: PantryAisle;
  confidence: 'high' | 'low';
  container_unknown: boolean;
};

/** What one photo of a scan held (`public.pantry_scan_photos`, or scan-pantry's answer). */
export type ScanPhoto = {
  /** Null for a photo that wasn't a kitchen: nothing is kept for it. */
  id: string | null;
  scan_id: string;
  place: PantryPlace;
  quality: PhotoQuality;
  items: ScanItem[];
  truncated: boolean;
  from_phone: boolean;
  created_at: string;
  /** scan-pantry had already read this exact photo in this scan; this is that earlier result. */
  duplicate?: boolean;
};

/** A row on the review screen, after the photos of a scan are merged. */
export type ReviewItem = {
  /** Stable within a scan: place + name key. */
  key: string;
  name: string;
  nameEn: string;
  brand: string;
  place: PantryPlace;
  aisle: PantryAisle;
  /** Ticked when the model was sure; "not sure" rows start unticked. */
  sure: boolean;
  containerUnknown: boolean;
  /** Added by hand on the review screen. */
  manual?: boolean;
};
