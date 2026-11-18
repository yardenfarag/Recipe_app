import { assertEquals, assertExists } from 'jsr:@std/assert@1';

import { createRequestHandler, errorCodeOf, type ObserveDeps, type RequestLog, userIdFromAuthHeader } from './observe.ts';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

function fakeDeps() {
  const logs: RequestLog[] = [];
  const reports: { kind: string; detail: unknown; fn: string; requestId: string }[] = [];
  const deps: ObserveDeps = {
    log: (line) => logs.push(line),
    reportException: (err, ctx) => reports.push({ kind: 'exception', detail: err, fn: ctx.fn, requestId: ctx.requestId }),
    reportMessage: (message, ctx) => reports.push({ kind: 'message', detail: message, fn: ctx.fn, requestId: ctx.requestId }),
    flush: () => Promise.resolve(),
  };
  return { deps, logs, reports };
}

const post = (headers: Record<string, string> = {}) =>
  new Request('https://x.supabase.co/functions/v1/demo', { method: 'POST', headers });

Deno.test('userIdFromAuthHeader reads sub from a signed-in user token', () => {
  assertEquals(userIdFromAuthHeader(`Bearer ${jwt({ sub: 'user-1', role: 'authenticated' })}`), 'user-1');
});

Deno.test('userIdFromAuthHeader ignores the anon key, webhooks and junk', () => {
  assertEquals(userIdFromAuthHeader(`Bearer ${jwt({ role: 'anon' })}`), null);
  assertEquals(userIdFromAuthHeader('Basic abc'), null);
  assertEquals(userIdFromAuthHeader('Bearer not-a-jwt'), null);
  assertEquals(userIdFromAuthHeader(null), null);
});

Deno.test('errorCodeOf reads code (or a short error) from a JSON error body', async () => {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  assertEquals(await errorCodeOf(json({ status: 'failed', code: 'daily_limit' }, 429)), 'daily_limit');
  assertEquals(await errorCodeOf(json({ error: 'Method not allowed' }, 405)), 'Method not allowed');
  assertEquals(await errorCodeOf(json({ status: 'ok' }, 200)), null);
  assertEquals(await errorCodeOf(new Response('oops', { status: 500 })), null);
});

Deno.test('a normal request logs one line and reports nothing', async () => {
  const { deps, logs, reports } = fakeDeps();
  const handler = createRequestHandler('demo', () => new Response('ok'), deps);
  const res = await handler(post({ Authorization: `Bearer ${jwt({ sub: 'u1', role: 'authenticated' })}` }));
  assertEquals(res.status, 200);
  assertExists(res.headers.get('x-request-id'));
  assertEquals(reports.length, 0);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].fn, 'demo');
  assertEquals(logs[0].status, 200);
  assertEquals(logs[0].user_id, 'u1');
  assertEquals(logs[0].request_id, res.headers.get('x-request-id'));
});

Deno.test('an uncaught error becomes a 500 with CORS headers and is reported once', async () => {
  const { deps, logs, reports } = fakeDeps();
  const handler = createRequestHandler('demo', () => {
    throw new Error('boom');
  }, deps);
  const res = await handler(post());
  assertEquals(res.status, 500);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(reports.length, 1);
  assertEquals(reports[0].kind, 'exception');
  assertEquals(logs[0].status, 500);
  assertEquals(logs[0].code, 'internal_error');
});

Deno.test('a 5xx response the function returned itself is reported as a message', async () => {
  const { deps, reports } = fakeDeps();
  const handler = createRequestHandler('demo', () => new Response('{"error":"x"}', { status: 502 }), deps);
  await handler(post());
  assertEquals(reports.length, 1);
  assertEquals(reports[0].kind, 'message');
  assertEquals(reports[0].fn, 'demo');
});

Deno.test('a 4xx response is logged but not reported', async () => {
  const { deps, logs, reports } = fakeDeps();
  const handler = createRequestHandler(
    'demo',
    () => new Response('{"status":"failed","code":"auth_required"}', { status: 401, headers: { 'Content-Type': 'application/json' } }),
    deps,
  );
  await handler(post());
  assertEquals(reports.length, 0);
  assertEquals(logs[0].code, 'auth_required');
});

Deno.test('CORS preflight is neither logged nor reported', async () => {
  const { deps, logs, reports } = fakeDeps();
  const handler = createRequestHandler('demo', () => new Response('ok'), deps);
  await handler(new Request('https://x.supabase.co/functions/v1/demo', { method: 'OPTIONS' }));
  assertEquals(logs.length, 0);
  assertEquals(reports.length, 0);
});

Deno.test('a call to the -preview copy is tagged as preview', async () => {
  const { deps, reports } = fakeDeps();
  let seen = '';
  const handler = createRequestHandler('demo', () => new Response('x', { status: 500 }), {
    ...deps,
    reportMessage: (_m, ctx) => {
      seen = ctx.environment;
      reports.push({ kind: 'message', detail: _m, fn: ctx.fn, requestId: ctx.requestId });
    },
  });
  await handler(new Request('https://x.supabase.co/functions/v1/demo-preview', { method: 'POST' }));
  assertEquals(seen, 'preview');
  // The Edge Runtime itself sees the path without /functions/v1.
  seen = '';
  await handler(new Request('http://localhost/demo-preview', { method: 'POST' }));
  assertEquals(seen, 'preview');
  await handler(new Request('http://localhost/demo', { method: 'POST' }));
  assertEquals(seen, 'production');
});

Deno.test('the test trigger throws only on a -preview copy', async () => {
  const { deps, reports } = fakeDeps();
  const handler = createRequestHandler('demo', () => new Response('ok'), deps);
  const headers = { 'x-observe-test': 'error' };
  const real = await handler(new Request('https://x.supabase.co/functions/v1/demo', { method: 'POST', headers }));
  assertEquals(real.status, 200);
  assertEquals(reports.length, 0);
  const preview = await handler(new Request('https://x.supabase.co/functions/v1/demo-preview', { method: 'POST', headers }));
  assertEquals(preview.status, 500);
  assertEquals(reports.length, 1);
});

Deno.test('a request id sent by the caller is kept', async () => {
  const { deps, logs } = fakeDeps();
  const handler = createRequestHandler('demo', () => new Response('ok'), deps);
  const res = await handler(post({ 'x-request-id': 'abc-12345' }));
  assertEquals(res.headers.get('x-request-id'), 'abc-12345');
  assertEquals(logs[0].request_id, 'abc-12345');
});
