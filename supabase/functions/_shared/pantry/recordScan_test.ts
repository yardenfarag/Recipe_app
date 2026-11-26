import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import type { PantryScanResult } from './pantryScan.ts';
import { scanOnePhoto, type ScanOnePhotoInput } from './recordScan.ts';

/** Just enough of the service client: the daily-cap RPCs and the scan photo insert. */
function fakeAdmin(options: { limited?: boolean } = {}) {
  const calls: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const admin = {
    rpc(name: string) {
      calls.push(name);
      if (name === 'reserve_daily_ai_usage') return Promise.resolve({ data: options.limited ? -1 : 1, error: null });
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { is_admin: false }, error: null }) }) }) };
      }
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'photo-1', created_at: '2026-11-26T12:00:00Z' }, error: null }),
            }),
          };
        },
      };
    },
  } as unknown as Db;
  return { admin, calls, inserted };
}

const result = (over: Partial<PantryScanResult> = {}) => ({
  quality: 'ok' as const,
  truncated: false,
  items: [{ name: 'חלב', nameEn: 'milk', brand: 'Tnuva', aisle: 'dairy' as const, confidence: 'high' as const, containerUnknown: false }],
  usage: null,
  ...over,
});

function input(admin: Db, scan: ScanOnePhotoInput['scan'], logged: unknown[]): ScanOnePhotoInput {
  return {
    admin,
    userId: 'user-1',
    scanId: '00000000-0000-4000-8000-000000000001',
    place: 'fridge',
    language: 'he',
    photo: { base64: 'abc', mime: 'image/jpeg' },
    fromPhone: true,
    logUsage: (event) => Promise.resolve(logged.push(event)),
    scan,
  };
}

Deno.test('a kitchen photo is counted, read, kept on the scan and logged', async () => {
  const { admin, calls, inserted } = fakeAdmin();
  const logged: unknown[] = [];
  const photo = await scanOnePhoto(input(admin, () => Promise.resolve(result()), logged));
  assertEquals(photo.id, 'photo-1');
  assertEquals(photo.items, [{ name: 'חלב', name_en: 'milk', brand: 'Tnuva', aisle: 'dairy', confidence: 'high', container_unknown: false }]);
  assertEquals(calls, ['reserve_daily_ai_usage']);
  assertEquals(inserted[0].from_phone, true);
  assertEquals((logged[0] as { status: string }).status, 'ok');
});

Deno.test('a photo that is not a kitchen gives its use back and keeps nothing', async () => {
  const { admin, calls, inserted } = fakeAdmin();
  const logged: unknown[] = [];
  const photo = await scanOnePhoto(input(admin, () => Promise.resolve(result({ quality: 'not_kitchen', items: [] })), logged));
  assertEquals([photo.id, photo.quality, photo.items], [null, 'not_kitchen', []]);
  assertEquals(calls, ['reserve_daily_ai_usage', 'refund_daily_ai_usage']);
  assertEquals(inserted, []);
});

Deno.test('a failed read gives its use back and says try again', async () => {
  const { admin, calls } = fakeAdmin();
  const logged: unknown[] = [];
  const error = await assertRejects(
    () => scanOnePhoto(input(admin, () => Promise.reject(new Error('timeout')), logged)),
    HttpError,
  );
  assertEquals(error.code, 'scan_failed');
  assertEquals(calls, ['reserve_daily_ai_usage', 'refund_daily_ai_usage']);
  assertEquals((logged[0] as { status: string }).status, 'error');
});

Deno.test('past the daily cap nothing is read', async () => {
  const { admin } = fakeAdmin({ limited: true });
  let read = false;
  const error = await assertRejects(
    () => scanOnePhoto(input(admin, () => ((read = true), Promise.resolve(result())), [])),
    HttpError,
  );
  assertEquals([error.code, error.status, read], ['daily_limit', 429, false]);
});
