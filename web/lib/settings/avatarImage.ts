/** Profile photos are shown small; 512 px keeps them sharp on high-density screens. */
const SIZE = 512;

/**
 * Crops a chosen photo to a centred square and shrinks it to a JPEG, as base64 for `uploadAvatar` (the mobile app
 * crops to a square in the picker). Null when the browser can't read the file as an image.
 */
export async function squareAvatarFromFile(file: File): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  } finally {
    bitmap.close();
  }
}
