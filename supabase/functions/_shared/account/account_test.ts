// npx deno test -A --no-lock supabase/functions/_shared/account/account_test.ts
//
// Account deletion (PIN-153): whose photos are removed, and the customer records at the
// payment providers.

import { assertEquals } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import { deletePaymentCustomers } from './paymentCustomers.ts';
import { legacyPhotoPath, removeUserPhotos } from './userPhotos.ts';

const BASE = 'https://ccobefeofhnncpgifxel.supabase.co/storage/v1/object/public/recipe-thumbnails';
const ME = '10000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';

Deno.test('only a photo directly under photo/ counts as a legacy upload', () => {
  assertEquals(legacyPhotoPath(`${BASE}/photo/abc.jpg`), 'photo/abc.jpg');
  assertEquals(legacyPhotoPath(`${BASE}/photo/abc%20def.jpg?v=2`), 'photo/abc def.jpg');
  // Someone's own folder, mine or not: never reached through a recipe.
  assertEquals(legacyPhotoPath(`${BASE}/photo/${OTHER}/abc.jpg`), null);
  assertEquals(legacyPhotoPath(`${BASE}/photo/${ME}/abc.jpg`), null);
  assertEquals(legacyPhotoPath(`${BASE}/photo/guest/abc.jpg`), null);
  // Other folders, other hosts, junk.
  assertEquals(legacyPhotoPath(`${BASE}/instagram/abc.jpg`), null);
  assertEquals(legacyPhotoPath(`${BASE}/photo/`), null);
  assertEquals(legacyPhotoPath(`${BASE}/photo/..`), null);
  assertEquals(legacyPhotoPath(`${BASE}/photo/%E0%A4%A`), null);
  assertEquals(legacyPhotoPath('https://example.com/photo/abc.jpg'), null);
  assertEquals(legacyPhotoPath(null), null);
});

interface FakeState {
  /** Files in photo/<ME>/ */
  ownFiles: string[];
  /** image_url of the deleting user's recipes */
  myRecipeImages: string[];
  /** image_url of other users' recipes */
  otherRecipeImages: string[];
  removed: string[];
  listCalls: number;
}

/** Just enough of the Supabase client for removeUserPhotos. */
function fakeAdmin(state: FakeState): Db {
  const storage = {
    from: () => ({
      list: (prefix: string, options: { limit: number; offset: number }) => {
        state.listCalls++;
        const page = prefix === `photo/${ME}` ? state.ownFiles.slice(options.offset, options.offset + options.limit) : [];
        return Promise.resolve({ data: page.map((name) => ({ name })), error: null });
      },
      remove: (paths: string[]) => {
        state.removed.push(...paths);
        return Promise.resolve({ data: [], error: null });
      },
    }),
  };
  const from = () => {
    const filters: { mine: boolean; pattern: string } = { mine: true, pattern: '' };
    const query = {
      select: () => query,
      eq: () => ((filters.mine = true), query),
      neq: () => ((filters.mine = false), query),
      like: (_column: string, pattern: string) => ((filters.pattern = pattern), query),
      limit: () => query,
      then: (resolve: (value: unknown) => void) => {
        const needle = filters.pattern.replaceAll('%', '');
        const rows = (filters.mine ? state.myRecipeImages : state.otherRecipeImages)
          .filter((url) => url.includes(needle))
          .map((image_url, i) => ({ id: String(i), image_url }));
        resolve({ data: rows, error: null });
      },
    };
    return query;
  };
  return { storage, from } as unknown as Db;
}

Deno.test("deleting an account never removes another account's photos", async () => {
  const state: FakeState = {
    ownFiles: ['mine-1.jpg', 'mine-2.jpg'],
    myRecipeImages: [
      `${BASE}/photo/${ME}/mine-1.jpg`,
      // Copied in by claiming someone's share, or set by hand to point at their photo.
      `${BASE}/photo/${OTHER}/theirs.jpg`,
      `${BASE}/photo/guest/someone.jpg`,
      // Old uploads with no owner in the path: one only I use, one another account uses too.
      `${BASE}/photo/old-mine.jpg`,
      `${BASE}/photo/old-shared.jpg`,
      `${BASE}/instagram/reel.jpg`,
    ],
    otherRecipeImages: [`${BASE}/photo/${OTHER}/theirs.jpg`, `${BASE}/photo/old-shared.jpg`],
    removed: [],
    listCalls: 0,
  };
  await removeUserPhotos(fakeAdmin(state), ME);
  assertEquals(state.removed.sort(), [`photo/${ME}/mine-1.jpg`, `photo/${ME}/mine-2.jpg`, 'photo/old-mine.jpg']);
});

Deno.test('a folder with more than 1,000 photos is emptied', async () => {
  const state: FakeState = {
    ownFiles: Array.from({ length: 2350 }, (_, i) => `p${String(i).padStart(5, '0')}.jpg`),
    myRecipeImages: [],
    otherRecipeImages: [],
    removed: [],
    listCalls: 0,
  };
  await removeUserPhotos(fakeAdmin(state), ME);
  assertEquals(state.removed.length, 2350);
  assertEquals(state.listCalls, 3);
});

async function withEnv(vars: Record<string, string | null>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === null) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test('the customer is deleted at both providers, by user id', () =>
  withEnv({ POLAR_ACCESS_TOKEN: 'polar_oat_test', REVENUECAT_REST_API_KEY: 'sk_test' }, async () => {
    const calls: { url: string; method?: string; auth: string | null }[] = [];
    const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method, auth: new Headers(init?.headers).get('Authorization') });
      return Promise.resolve(url.includes('polar') ? new Response(null, { status: 204 }) : Response.json({ deleted: true }));
    }) as typeof fetch;
    assertEquals(await deletePaymentCustomers(ME, fetchImpl), { polar: 'deleted', revenuecat: 'deleted' });
    assertEquals(calls, [
      { url: `https://api.polar.sh/v1/customers/external/${ME}?anonymize=true`, method: 'DELETE', auth: 'Bearer polar_oat_test' },
      { url: `https://api.revenuecat.com/v1/subscribers/${ME}`, method: 'DELETE', auth: 'Bearer sk_test' },
    ]);
  }));

Deno.test('a provider that never saw the user, is down, or has no key does not stop the deletion', () =>
  withEnv({ POLAR_ACCESS_TOKEN: 'polar_oat_test', REVENUECAT_REST_API_KEY: null }, async () => {
    const notFound = (() => Promise.resolve(new Response('{}', { status: 404 }))) as typeof fetch;
    assertEquals(await deletePaymentCustomers(ME, notFound), { polar: 'not_found', revenuecat: 'skipped' });

    const forbidden = (() => Promise.resolve(new Response('{}', { status: 403 }))) as typeof fetch;
    assertEquals(await deletePaymentCustomers(ME, forbidden), { polar: 'failed', revenuecat: 'skipped' });

    const down = (() => Promise.reject(new TypeError('network down'))) as typeof fetch;
    assertEquals(await deletePaymentCustomers(ME, down), { polar: 'failed', revenuecat: 'skipped' });
  }));
