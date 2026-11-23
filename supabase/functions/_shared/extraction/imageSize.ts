/**
 * How sharp a recipe cover is, and which of a source's pictures to take (PIN-176).
 *
 * Sources list one picture at several sizes and often put the smallest first: TikTok's `cover` is
 * 300×400, a recipe site's JSON-LD list starts with its 225×225 thumbnail. Until 2026-11-23 we took
 * the first one, so most TikTok and many website covers were blurry.
 *
 * Two steps fix that. Each source ranks its pictures by the size it states (`rankImageCandidates`),
 * and persistThumbnail.ts measures what it downloads (`readImageSize`, from the file's header, with
 * no decoding) and tries the next one while the picture is too small.
 */

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
}

/** A cover this big on its short side looks sharp on a phone and on the web recipe page. */
export const IDEAL_SHORT_SIDE = 1080;
/** Below this the cover looks soft, and a larger picture is worth one more download. */
export const SHARP_SHORT_SIDE = 720;

/** Width and height from a JPEG, PNG, GIF, WebP or AVIF header. Null when it can't tell. */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  try {
    return jpegSize(bytes) ?? pngSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes) ?? avifSize(bytes);
  } catch {
    return null;
  }
}

export function shortSide(size: ImageSize | null | undefined): number {
  return size ? Math.min(size.width, size.height) : 0;
}

/**
 * The size written in a resized copy's file name: WordPress names them `photo-225x225.jpg`. Only that
 * pattern, right before the extension, so a date or an id in the path isn't read as a size.
 */
export function sizeFromUrl(url: string): ImageSize | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split('?')[0];
  }
  const match = path.match(/[-_](\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp|gif|avif)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The URLs best first, without repeats. A picture's size is what the source states, else what its file
 * name says. Sharp pictures come first, the one closest to IDEAL_SHORT_SIDE leading, so a 4K original
 * doesn't slow every page when a 1080 copy exists. Then the ones of unknown size, in the source's
 * order (a WordPress original has no size in its name). The small ones go last, largest first.
 */
export function rankImageCandidates(candidates: ImageCandidate[]): string[] {
  // A URL listed twice (the JSON-LD photo is often the og:image too) keeps its first place and any
  // size either listing states.
  const byUrl = new Map<string, { url: string; index: number; short: number | null }>();
  candidates.forEach((candidate, index) => {
    const url = candidate.url?.trim();
    if (!url) return;
    const stated = candidate.width && candidate.height && candidate.width > 0 && candidate.height > 0
      ? { width: candidate.width, height: candidate.height }
      : null;
    const size = stated ?? sizeFromUrl(url);
    const short = size ? shortSide(size) : null;
    const known = byUrl.get(url);
    if (!known) byUrl.set(url, { url, index, short });
    else if (known.short === null) known.short = short;
  });
  const ranked = [...byUrl.values()];

  const tier = (short: number | null) =>
    short === null ? 2 : short >= IDEAL_SHORT_SIDE ? 0 : short >= SHARP_SHORT_SIDE ? 1 : 3;

  return ranked
    .sort((a, b) => {
      const ta = tier(a.short);
      const tb = tier(b.short);
      if (ta !== tb) return ta - tb;
      if (ta === 0) return a.short! - b.short!;
      if (ta === 2) return a.index - b.index;
      return b.short! - a.short!;
    })
    .map((entry) => entry.url);
}

/** A width or height as a source writes it: 1200, "1200", "1200px" or { value: 1200 }. */
export function readDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return readDimension((value as { value: unknown }).value);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------------------------

function u16be(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function u32be(b: Uint8Array, i: number): number {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}

function u24le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}

function ascii(b: Uint8Array, i: number, length: number): string {
  return String.fromCharCode(...b.subarray(i, i + length));
}

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The first start-of-frame marker holds the size; it can come after the EXIF and colour blocks. */
function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Markers with no length: restart markers, start and end of image.
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return valid(u16be(b, i + 7), u16be(b, i + 5));
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || ascii(b, 1, 3) !== 'PNG' || ascii(b, 12, 4) !== 'IHDR') return null;
  return valid(u32be(b, 16), u32be(b, 20));
}

function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || ascii(b, 0, 3) !== 'GIF') return null;
  return valid(b[6] | (b[7] << 8), b[8] | (b[9] << 8));
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') return valid((b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') return valid(u24le(b, 24) + 1, u24le(b, 27) + 1);
  return null;
}

/** AVIF keeps the size in an `ispe` box; it sits within the first few hundred bytes. */
function avifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 16 || ascii(b, 4, 4) !== 'ftyp') return null;
  const end = Math.min(b.length - 12, 4096);
  for (let i = 8; i < end; i++) {
    if (b[i] === 0x69 && ascii(b, i, 4) === 'ispe') return valid(u32be(b, i + 8), u32be(b, i + 12));
  }
  return null;
}
