/**
 * A tiny fingerprint of a photo (a difference hash: is each of 8x8 points brighter than the one to its right), to
 * notice the same shot picked twice, or two near-identical shots, before paying to read it again. Re-saved or
 * resized copies of a photo come out the same; a different shelf almost never does.
 */
export type Fingerprint = string;

const COLUMNS = 9;
const ROWS = 8;

/** Fingerprints at most this many points apart are the same photo. 64 points in all. */
export const SAME_PHOTO_DISTANCE = 6;

export async function photoFingerprint(file: Blob): Promise<Fingerprint | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: COLUMNS, resizeHeight: ROWS, resizeQuality: "medium" });
  } catch {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = COLUMNS;
    canvas.height = ROWS;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, COLUMNS, ROWS);
    return fingerprintFromPixels(context.getImageData(0, 0, COLUMNS, ROWS).data);
  } finally {
    bitmap.close();
  }
}

/** The difference hash of a 9x8 RGBA image. Pure, so it is unit-tested. */
export function fingerprintFromPixels(rgba: ArrayLike<number>): Fingerprint {
  const light = (x: number, y: number) => {
    const i = (y * COLUMNS + x) * 4;
    return rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  };
  let bits = "";
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS - 1; x += 1) bits += light(x, y) > light(x + 1, y) ? "1" : "0";
  }
  return bits;
}

export function fingerprintDistance(a: Fingerprint, b: Fingerprint): number {
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) distance += 1;
  return distance;
}

export function isSamePhoto(a: Fingerprint | null | undefined, b: Fingerprint | null | undefined): boolean {
  return Boolean(a && b && a.length === b.length && fingerprintDistance(a, b) <= SAME_PHOTO_DISTANCE);
}
