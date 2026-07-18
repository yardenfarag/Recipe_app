/**
 * Client-side mirror of unwrapInstagramMedia — keep in sync with
 * supabase/functions/_shared/instagram.ts
 */
export function unwrapInstagramMedia(response: Record<string, unknown>): Record<string, unknown> | null {
  if (response.xdt_shortcode_media && typeof response.xdt_shortcode_media === 'object') {
    return response.xdt_shortcode_media as Record<string, unknown>;
  }

  const data = response.data;
  if (data && typeof data === 'object') {
    const dataRecord = data as Record<string, unknown>;

    for (const key of ['xdt_shortcode_media', 'shortcode_media', 'media'] as const) {
      const nested = dataRecord[key];
      if (nested && typeof nested === 'object') {
        return nested as Record<string, unknown>;
      }
    }

    if (hasInstagramMediaFields(dataRecord)) {
      return dataRecord;
    }
  }

  if (hasInstagramMediaFields(response)) {
    return response;
  }

  return null;
}

function hasInstagramMediaFields(record: Record<string, unknown>): boolean {
  return Boolean(
    record.shortcode ||
      record.owner ||
      record.video_url ||
      record.edge_media_to_caption ||
      record.display_url ||
      record.caption,
  );
}
