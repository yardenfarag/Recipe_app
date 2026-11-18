/**
 * Preview functions: a dev build can call `<name>-preview` instead of `<name>` for the Edge Functions listed in
 * EXPO_PUBLIC_FUNCTION_PREVIEWS (comma-separated). The "Deploy function preview" GitHub workflow deploys those
 * copies to production from a branch, so a change can be tried against real data before it merges.
 * See "Testing backend changes" in supabase/README.md.
 */

export function parsePreviewFunctions(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

/** The preview URL for a call to a listed function, or null when the call should go out unchanged. */
export function previewFunctionUrl(url: string, previews: Set<string>): string | null {
  const parsed = new URL(url);
  const match = /^\/functions\/v1\/([^/]+)(.*)$/.exec(parsed.pathname);
  if (!match || !previews.has(match[1])) return null;
  parsed.pathname = `/functions/v1/${match[1]}-preview${match[2]}`;
  return parsed.toString();
}

/** A fetch that routes calls to listed functions to their preview copies, or undefined when none are listed. */
export function createPreviewFetch(previews: Set<string>): typeof fetch | undefined {
  if (previews.size === 0) return undefined;
  console.warn(`[supabase] Using preview Edge Functions: ${[...previews].join(', ')}`);
  return (input, init) => {
    // supabase-js passes the URL as a string; a Request object goes out unchanged.
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    const preview = url ? previewFunctionUrl(url, previews) : null;
    return fetch(preview ?? input, init);
  };
}
