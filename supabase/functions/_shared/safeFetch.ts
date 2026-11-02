/**
 * `fetch` for URLs that a user or a scraped page chose (recipe pages,
 * og:image thumbnails, embedded videos). Refuses loopback, private, link-local
 * and other non-public targets, checks every address the host resolves to,
 * and re-checks each redirect hop, so a public page can't bounce the function
 * into the internal network (PIN-54).
 */

import { FetchError } from './errors.ts';

const MAX_REDIRECTS = 5;

export const NOT_PUBLIC_MESSAGE = 'That link is not a public webpage.';

export type ResolveHost = (host: string) => Promise<string[]>;

/** Fetches `url`, following up to five redirects, each one checked. */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  resolve: ResolveHost = resolveHost,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current, resolve);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new FetchError('safeFetch.ts', 'Too many redirects', { url });
}

/**
 * Reads a response body, or returns null (and cancels the download) as soon
 * as it passes `maxBytes`, so a missing or false content-length can't make
 * the function buffer an unbounded body.
 */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Throws unless `url` is http(s) and every address its host resolves to is public. */
export async function assertPublicHttpUrl(
  url: string,
  resolve: ResolveHost = resolveHost,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError('safeFetch.ts', 'Invalid URL', { url });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FetchError('safeFetch.ts', 'URL must be http(s)', { url });
  }

  // URL normalizes numeric hosts (2130706433, 0x7f.1) to dotted IPv4 and
  // IPv6 to compressed hex, so these checks see the real address.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host) || isNonPublicIp(host)) {
    throw new FetchError('safeFetch.ts', NOT_PUBLIC_MESSAGE, { url });
  }
  if (isIpLiteral(host)) return;

  const addresses = await resolve(host);
  if (addresses.some(isNonPublicIp)) {
    throw new FetchError('safeFetch.ts', NOT_PUBLIC_MESSAGE, { url });
  }
}

function isBlockedHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    // Single-label names (`db`, `kong`) only resolve inside the runtime's network.
    (!host.includes('.') && !host.includes(':'))
  );
}

/**
 * A and AAAA records for `host`. A lookup the runtime can't do returns no
 * addresses, which leaves the literal-host checks above as the guard.
 */
async function resolveHost(host: string): Promise<string[]> {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ]);
  return lookups.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

function isIpLiteral(host: string): boolean {
  return parseIpv4(host) !== null || host.includes(':');
}

/** True for any address that isn't ordinary public unicast. */
export function isNonPublicIp(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return isNonPublicIpv4(v4);
  if (!address.includes(':')) return false;

  const g = parseIpv6(address);
  if (!g) return true;
  if (g.slice(0, 6).every((x) => x === 0)) {
    // ::, ::1 and IPv4-compatible ::a.b.c.d
    return g[6] === 0 || isNonPublicIpv4(embeddedIpv4(g));
  }
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isNonPublicIpv4(embeddedIpv4(g)); // ::ffff:a.b.c.d
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isNonPublicIpv4(embeddedIpv4(g)); // NAT64 64:ff9b::a.b.c.d
  }
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (g[0] & 0xff00) === 0xff00 || // ff00::/8 multicast
    (g[0] === 0x2001 && g[1] === 0x0db8) // documentation
  );
}

function isNonPublicIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

function parseIpv4(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split('.').map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** Expands an IPv6 address to eight 16-bit groups, or null if malformed. */
function parseIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const v4 = parseIpv4(tail[1]);
    if (!v4) return null;
    const hex = `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    text = text.slice(0, -tail[1].length) + hex;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const values = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return values.some(Number.isNaN) ? null : values;
}

function embeddedIpv4(g: number[]): number[] {
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
}
