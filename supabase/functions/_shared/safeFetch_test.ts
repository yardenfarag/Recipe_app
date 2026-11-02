// npx deno test -A --no-lock supabase/functions/_shared/safeFetch_test.ts

import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from './errors.ts';
import { assertPublicHttpUrl, isNonPublicIp, NOT_PUBLIC_MESSAGE, safeFetch } from './safeFetch.ts';

const publicDns = () => Promise.resolve(['93.184.216.34']);

Deno.test('isNonPublicIp blocks private, loopback, link-local and mapped addresses', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.5',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    'not:an:ip',
  ]) {
    assert(isNonPublicIp(address), address);
  }
});

Deno.test('isNonPublicIp allows public addresses', () => {
  for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:808:808']) {
    assertFalse(isNonPublicIp(address), address);
  }
});

Deno.test('assertPublicHttpUrl rejects non-public literal hosts in any notation', async () => {
  for (const url of [
    'http://localhost/',
    'http://db:5432/',
    'http://metadata.google.internal/',
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://[::ffff:169.254.169.254]/latest/meta-data',
    'http://[fd00::1]/',
  ]) {
    await assertRejects(() => assertPublicHttpUrl(url, publicDns), FetchError, NOT_PUBLIC_MESSAGE);
  }
});

Deno.test('assertPublicHttpUrl rejects non-http schemes', async () => {
  await assertRejects(() => assertPublicHttpUrl('file:///etc/passwd', publicDns), FetchError);
});

Deno.test('assertPublicHttpUrl rejects hostnames that resolve to private addresses', async () => {
  await assertRejects(
    () => assertPublicHttpUrl('https://rebind.example/', () => Promise.resolve(['93.184.216.34', '10.0.0.5'])),
    FetchError,
    NOT_PUBLIC_MESSAGE,
  );
});

Deno.test('assertPublicHttpUrl accepts public hosts', async () => {
  await assertPublicHttpUrl('https://www.example.com/recipe', publicDns);
});

Deno.test('safeFetch re-checks every redirect hop', async () => {
  const realFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    return Promise.resolve(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    );
  }) as typeof fetch;
  try {
    await assertRejects(
      () => safeFetch('https://evil.example/r', {}, publicDns),
      FetchError,
      NOT_PUBLIC_MESSAGE,
    );
    assertEquals(requested, ['https://evil.example/r']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test('safeFetch follows public redirects, resolving relative locations', async () => {
  const realFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requested.push(url);
    assertEquals(init?.redirect, 'manual');
    if (url === 'https://a.example/start') {
      return Promise.resolve(new Response(null, { status: 301, headers: { location: '/final' } }));
    }
    return Promise.resolve(new Response('ok', { status: 200 }));
  }) as typeof fetch;
  try {
    const res = await safeFetch('https://a.example/start', {}, publicDns);
    assertEquals(await res.text(), 'ok');
    assertEquals(requested, ['https://a.example/start', 'https://a.example/final']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
