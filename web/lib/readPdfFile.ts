import { MAX_PDF_BYTES } from "@shared/lib/supabase/extractRecipe";

export type PdfFileRead = { ok: true; base64: string } | { ok: false; reason: "too_large" | "unreadable" };

/** True for a PDF, by its type or, when the browser gives none, its name. */
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
}

/**
 * Reads a chosen or dropped PDF as base64 for Snap (PIN-72). One over the server's limit is turned away before it is
 * read. The PDF is sent as is: the server reads its text, or its pages when they are scans.
 */
export async function readPdfFile(file: File): Promise<PdfFileRead> {
  if (file.size > MAX_PDF_BYTES) return { ok: false, reason: "too_large" };
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return base64 ? { ok: true, base64 } : { ok: false, reason: "unreadable" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
