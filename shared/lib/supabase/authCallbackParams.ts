/** Parses OAuth / recovery deep links (query or #hash tokens). */
export function parseAuthCallbackParams(url: string): {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenHash?: string;
  type?: string;
} {
  const normalized = url.trim().replace('#', '?');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {};
  }

  const get = (key: string) => parsed.searchParams.get(key) ?? undefined;
  return {
    code: get('code'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    tokenHash: get('token_hash'),
    type: get('type'),
  };
}
