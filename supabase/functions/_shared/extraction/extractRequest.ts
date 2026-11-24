import { HttpError } from '../core/httpError.ts';
import { type DecodedPdf, decodePdfBase64, pdfRejectMessage, type PdfRejectCode } from './pdfRecipe.ts';
import { readRecipeText, textRejectMessage, type TextRejectCode } from './textRecipe.ts';

/** extract-recipe's request, read from `{ url | image_base64 | pdf_base64 | text, guest_install_id?, ... }`. */
export interface ExtractRequest {
  url: string;
  imageBase64: string | null;
  imageMime: string;
  pdf: DecodedPdf | null;
  recipeText: string | null;
  guestInstallId: string | null;
  /** The app's id for this import (it keys the credit reservation), else a new random one. */
  requestId: string;
  forceExtract: boolean;
}

const invalidJson = HttpError.legacy(400, 'Invalid JSON body');

/**
 * Reads extract-recipe's request, before sign-in, credits or any model call. A photo over 2 MB gets the old `{ error }`
 * 400; a PDF or a text turned away gets its failed 200 (pdfRejectBody, textRejectBody). Like the code it came from,
 * a body that isn't an object (`null`, say) is answered as invalid JSON.
 */
export function parseExtractRequest(raw: unknown): ExtractRequest {
  let url = '';
  let imageBase64: string | null = null;
  let imageMime = 'image/jpeg';
  let pdf: DecodedPdf | null = null;
  let recipeText: string | null = null;
  let guestInstallId: string | null = null;
  let requestId: string = crypto.randomUUID();
  let forceExtract = false;
  try {
    const body = raw as any;
    url = String(body.url ?? '').trim();
    const rawImage = body.image_base64 ?? body.imageBase64;
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
      if (imageBase64.length > 2_000_000) {
        throw HttpError.legacy(400, 'Image is too large. Try a smaller photo.');
      }
    }
    const rawPdf = body.pdf_base64 ?? body.pdfBase64;
    if (!imageBase64 && typeof rawPdf === 'string' && rawPdf.trim().length > 80) {
      const decoded = decodePdfBase64(rawPdf);
      if (!decoded.ok) throw HttpError.withBody(200, pdfRejectBody(decoded.code));
      pdf = decoded.pdf;
    }
    if (!imageBase64 && !pdf && !url) {
      // Too short or too long is turned away here, before sign-in, credits or any model call.
      const read = readRecipeText(body.text);
      if (read && !read.ok) throw HttpError.withBody(200, textRejectBody(read.code));
      if (read) recipeText = read.text;
    }
    const rawInstall = body.guest_install_id ?? body.guestInstallId;
    if (typeof rawInstall === 'string' && rawInstall.trim().length >= 8) {
      guestInstallId = rawInstall.trim().slice(0, 128);
    }
    const rawRequestId = body.request_id ?? body.requestId;
    if (typeof rawRequestId === 'string' && rawRequestId.trim().length >= 8) {
      requestId = rawRequestId.trim().slice(0, 128);
    }
    forceExtract = body.force_extract === true || body.forceExtract === true;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw invalidJson;
  }

  if (!url && !imageBase64 && !pdf && recipeText === null) {
    throw HttpError.legacy(400, 'Missing "url", "image_base64", "pdf_base64" or "text" in request body');
  }

  return { url, imageBase64, imageMime, pdf, recipeText, guestInstallId, requestId, forceExtract };
}

/** A PDF turned away before any model call (too big, too many pages, won't open). Nothing was charged. */
export function pdfRejectBody(code: PdfRejectCode): Record<string, unknown> {
  return {
    status: 'failed',
    platform: 'photo',
    code,
    message: pdfRejectMessage(code),
    tokens_charged: 0,
  };
}

/** A text turned away before sign-in or any model call (too short, too long). Nothing was charged. */
export function textRejectBody(code: TextRejectCode): Record<string, unknown> {
  return {
    status: 'failed',
    platform: 'text',
    code,
    message: textRejectMessage(code),
    tokens_charged: 0,
  };
}
