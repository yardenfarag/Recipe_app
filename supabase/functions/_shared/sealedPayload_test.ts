// npx deno test -A --no-lock supabase/functions/_shared/sealedPayload_test.ts

import { assertEquals, assertFalse } from 'jsr:@std/assert@1';

import { openJson, sealJson } from './sealedPayload.ts';

const SECRET = 'test-service-role-key';

Deno.test('a sealed value opens for the same context', async () => {
  const sealed = await sealJson({ title: 'Soup', servings: 2 }, 'user-1:res-1', SECRET);
  assertFalse(sealed.includes('Soup'));
  assertEquals(await openJson(sealed, 'user-1:res-1', SECRET), { title: 'Soup', servings: 2 });
});

Deno.test('a sealed value does not open for another user or reservation', async () => {
  const sealed = await sealJson({ title: 'Soup' }, 'user-1:res-1', SECRET);
  assertEquals(await openJson(sealed, 'user-2:res-1', SECRET), null);
  assertEquals(await openJson(sealed, 'user-1:res-2', SECRET), null);
});

Deno.test('an altered or malformed value does not open', async () => {
  const sealed = await sealJson({ title: 'Soup' }, 'ctx', SECRET);
  const [iv, cipher] = sealed.split('.');
  const flipped = `${iv}.${cipher.slice(0, -2)}${cipher.endsWith('AA') ? 'BB' : 'AA'}`;
  assertEquals(await openJson(flipped, 'ctx', SECRET), null);
  assertEquals(await openJson('not-sealed', 'ctx', SECRET), null);
  assertEquals(await openJson(sealed, 'ctx', 'another-secret'), null);
});
