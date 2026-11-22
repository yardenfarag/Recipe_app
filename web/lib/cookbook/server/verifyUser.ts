/**
 * Checks a sign-in token with Supabase Auth (`GET /auth/v1/user`), the same check the Edge Functions make. Returns
 * the account id, null for a token that is expired or not ours, and throws when Auth can't be reached.
 */
export function supabaseUserVerifier(options: { url: string | undefined; key: string | undefined; fetchImpl?: typeof fetch }) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (accessToken: string): Promise<string | null> => {
    if (!options.url || !options.key) throw new Error("Supabase URL or key is not set");
    const response = await fetchImpl(`${options.url.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: options.key, Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error(`Supabase Auth answered ${response.status}`);
    const user = (await response.json()) as { id?: unknown };
    return typeof user.id === "string" && user.id ? user.id : null;
  };
}
