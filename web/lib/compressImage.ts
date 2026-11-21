export type CompressedImage = { base64: string; mimeType: "image/jpeg" };

/** The most text a photo may take up once encoded; the same limit the mobile app uses. */
const MAX_BASE64_CHARS = 1_400_000;

/** Tries a large, then a smaller and rougher version, as the mobile app does. */
const ATTEMPTS = [
  { maxWidth: 1280, quality: 0.55 },
  { maxWidth: 960, quality: 0.35 },
];

/**
 * Shrinks a photo chosen from the computer or taken on a phone to a small JPEG, as text the Edge Functions
 * accept. Returns null when the file isn't an image the browser can read, or stays too large.
 */
export async function compressImageFile(file: File): Promise<CompressedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    for (const { maxWidth, quality } of ATTEMPTS) {
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
      if (base64 && base64.length <= MAX_BASE64_CHARS) return { base64, mimeType: "image/jpeg" };
    }
    return null;
  } finally {
    bitmap.close();
  }
}
