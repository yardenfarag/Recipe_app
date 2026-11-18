/**
 * Sign in with Apple token exchange + revoke for account deletion (TN3194).
 *
 * Secrets (Supabase Edge Function):
 * - APPLE_CLIENT_ID — native app bundle id (com.pinch.myapp)
 * - APPLE_TEAM_ID
 * - APPLE_KEY_ID
 * - APPLE_PRIVATE_KEY — .p8 contents (PEM), newlines may be escaped as \n
 */

function appleSecretsConfigured(): boolean {
  return Boolean(
    Deno.env.get('APPLE_CLIENT_ID') &&
      Deno.env.get('APPLE_TEAM_ID') &&
      Deno.env.get('APPLE_KEY_ID') &&
      Deno.env.get('APPLE_PRIVATE_KEY'),
  );
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createAppleClientSecret(): Promise<string> {
  const teamId = Deno.env.get('APPLE_TEAM_ID')!;
  const clientId = Deno.env.get('APPLE_CLIENT_ID')!;
  const keyId = Deno.env.get('APPLE_KEY_ID')!;
  const privateKeyPem = Deno.env.get('APPLE_PRIVATE_KEY')!;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );

  // Web Crypto returns IEEE P1363 (r||s); Apple expects that for ES256 JWTs.
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function exchangeAuthorizationCode(
  authorizationCode: string,
  clientSecret: string,
): Promise<{ refresh_token?: string; access_token?: string }> {
  const clientId = Deno.env.get('APPLE_CLIENT_ID')!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Apple token exchange failed:', res.status, text);
    return {};
  }

  return (await res.json()) as { refresh_token?: string; access_token?: string };
}

async function revokeAppleToken(
  token: string,
  tokenTypeHint: 'refresh_token' | 'access_token',
  clientSecret: string,
): Promise<boolean> {
  const clientId = Deno.env.get('APPLE_CLIENT_ID')!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint,
  });

  const res = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Apple token revoke failed:', res.status, text);
    return false;
  }
  return true;
}

/**
 * Best-effort Apple credential revoke. Account deletion proceeds even if this
 * fails (TN3194: still fulfill deletion when tokens are unavailable).
 */
export async function revokeAppleCredentials(authorizationCode?: string | null): Promise<void> {
  if (!authorizationCode) {
    console.log('Apple revoke skipped: no authorization code provided');
    return;
  }
  if (!appleSecretsConfigured()) {
    console.warn(
      'Apple revoke skipped: APPLE_CLIENT_ID / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set',
    );
    return;
  }

  try {
    const clientSecret = await createAppleClientSecret();
    const tokens = await exchangeAuthorizationCode(authorizationCode, clientSecret);
    if (tokens.refresh_token) {
      await revokeAppleToken(tokens.refresh_token, 'refresh_token', clientSecret);
      return;
    }
    if (tokens.access_token) {
      await revokeAppleToken(tokens.access_token, 'access_token', clientSecret);
      return;
    }
    console.warn('Apple revoke skipped: no tokens returned from authorization code');
  } catch (err) {
    console.error('Apple revoke error:', err);
  }
}
