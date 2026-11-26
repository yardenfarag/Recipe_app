export type CompressedImage = { base64: string; mimeType: "image/jpeg" };

type Attempt = { maxWidth: number; quality: number };

/**
 * - `standard`: Snap, Guess the recipe and the rest. The same as the mobile app: a large, then a smaller and rougher
 *   version, at most 1.4M characters once encoded.
 * - `pantry`: a pantry scan (PIN-181) reads small print on crowded shelves, so it sends a sharp 2048px photo. The
 *   bake-off found far fewer items at 1280px (eval/results/pantry.md). The server takes up to 2M characters.
 */
const PRESETS: Record<"standard" | "pantry", { attempts: Attempt[]; maxChars: number }> = {
  standard: {
    attempts: [
      { maxWidth: 1280, quality: 0.55 },
      { maxWidth: 960, quality: 0.35 },
    ],
    maxChars: 1_400_000,
  },
  pantry: {
    attempts: [
      { maxWidth: 2048, quality: 0.8 },
      { maxWidth: 1792, quality: 0.7 },
      { maxWidth: 1536, quality: 0.6 },
    ],
    maxChars: 1_900_000,
  },
};

export type CompressPreset = keyof typeof PRESETS;

/**
 * Shrinks a photo chosen from the computer or taken on a phone to a JPEG, as text the Edge Functions accept. The
 * longer side is what's capped, so a tall shelf photo keeps its detail. Returns null when the file isn't an image
 * the browser can read, or stays too large.
 */
export async function compressImageFile(file: File, preset: CompressPreset = "standard"): Promise<CompressedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const { attempts, maxChars } = PRESETS[preset];
  try {
    for (const { maxWidth, quality } of attempts) {
      const longest = preset === "pantry" ? Math.max(bitmap.width, bitmap.height) : bitmap.width;
      const scale = Math.min(1, maxWidth / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
      if (base64 && base64.length <= maxChars) return { base64, mimeType: "image/jpeg" };
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** A small preview of a photo for the scan screen, as an object URL. Revoke it when the photo goes. */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file);
}
