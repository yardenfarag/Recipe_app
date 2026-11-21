import type { EditorPhoto } from "@shared/lib/recipeEditor";

import { compressImageFile } from "@/lib/compressImage";

/** The first image among pasted or dropped files, or null. */
export function imageFileFrom(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

/** True when a drag carries files, so the page can offer to take a photo (text dragged between fields doesn't). */
export const dragHasFiles = (data: DataTransfer | null) => Boolean(data && Array.from(data.types).includes("Files"));

export type PhotoResult = { ok: true; photo: EditorPhoto } | { ok: false; reason: "not_image" | "too_large" };

/**
 * A chosen, dropped or pasted file as the editor's new photo. It is shrunk to a JPEG in the browser, the way the
 * mobile app does before sending, and the save-recipe-edit function stores it (the app never uploads it itself).
 */
export async function photoFromFile(file: File): Promise<PhotoResult> {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "not_image" };
  const image = await compressImageFile(file);
  if (!image) return { ok: false, reason: "too_large" };
  return { ok: true, photo: { kind: "replace", base64: image.base64, mimeType: image.mimeType } };
}

/** What the photo area shows: the photo just chosen, the saved one, or nothing. */
export function photoPreviewSrc(photo: EditorPhoto, imageUrl: string | null): string | null {
  if (photo.kind === "replace") return `data:${photo.mimeType};base64,${photo.base64}`;
  if (photo.kind === "keep" && imageUrl) return imageUrl;
  return null;
}
