/**
 * Seals JSON so a client can hold it without reading or changing it, then hand
 * it back. repair-recipe uses this to keep the repaired recipe until the user
 * commits the credit (PIN-54). AES-GCM with a key derived from the service-role
 * key; `context` (user + reservation) is bound as associated data, so a sealed
 * value only opens for the request it was made for.
 */

const KEY_LABEL = 'pinch-sealed-payload-v1:';

async function sealingKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KEY_LABEL + secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealJson(value: unknown, context: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) },
    await sealingKey(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

/** The sealed value, or null if it was altered or sealed for another context. */
export async function openJson<T>(sealed: string, context: string, secret: string): Promise<T | null> {
  const [ivPart, cipherPart, extra] = sealed.split('.');
  if (!ivPart || !cipherPart || extra !== undefined) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivPart), additionalData: new TextEncoder().encode(context) },
      await sealingKey(secret),
      fromBase64Url(cipherPart),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
