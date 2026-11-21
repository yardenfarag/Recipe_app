import {
  importRequestIds,
  invokeImport,
  inventPhotoRequestKey,
  inventUrlRequestKey,
  type ExtractionRequestContext,
  type ExtractResult,
} from './extractRecipe';

export type InventResult = ExtractResult;

/** Guess the recipe from a link (`invent-recipe`), written in `language`. Same credits as a Snap. */
export async function inventRecipe(
  context: ExtractionRequestContext,
  url: string,
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  const { requestId, ids } = await importRequestIds(context, inventUrlRequestKey(url));
  return invokeImport('invent-recipe', requestId, {
    url,
    language,
    ...ids,
    ...(opts?.alreadyGated ? { already_gated: true } : {}),
  });
}

/** Guess the recipe from a photo of the dish (base64). */
export async function inventRecipeFromImage(
  context: ExtractionRequestContext,
  imageBase64: string,
  mimeType = 'image/jpeg',
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  const { requestId, ids } = await importRequestIds(context, inventPhotoRequestKey(imageBase64));
  return invokeImport('invent-recipe', requestId, {
    image_base64: imageBase64,
    image_mime: mimeType,
    language,
    ...ids,
    ...(opts?.alreadyGated ? { already_gated: true } : {}),
  });
}
