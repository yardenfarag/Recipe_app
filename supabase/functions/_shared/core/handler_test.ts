import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createHandler, type HandlerConfig, type HandlerDeps, type HandlerFn, HttpError } from './handler.ts';
import type { AuthMode } from './handler.ts';
import type { UsageEventInput } from './usageLog.ts';
import type { Db } from './supabaseAdmin.ts';

// ---- stubs ----

interface StubOptions {
  /** The user getUser returns for the token 'Bearer good'; any other token is signed out. */
  userId?: string;
  isAdmin?: boolean | 'error';
  secretMatches?: boolean | 'error';
  noAuthedClient?: boolean;
  noServiceClient?: boolean;
}

function stubs(opts: StubOptions = {}) {
  const rpcCalls: { fn: string; args?: Record<string, unknown> }[] = [];
  const usage: UsageEventInput[] = [];
  let clock = 1_000;

  const rpcResult = (value: boolean | 'error' | undefined) =>
    value === 'error' ? { data: null, error: { message: 'rpc failed' } } : { data: value ?? false, error: null };

  const authedFor = (header: string) =>
    ({
      auth: {
        getUser: () =>
          Promise.resolve(
            header === 'Bearer good'
              ? { data: { user: { id: opts.userId ?? 'user-1' } }, error: null }
              : { data: { user: null }, error: { message: 'invalid JWT' } },
          ),
      },
      rpc: (fn: string) => {
        rpcCalls.push({ fn });
        return Promise.resolve(rpcResult(opts.isAdmin));
      },
    }) as unknown as Db;

  const service = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult(opts.secretMatches));
    },
  } as unknown as Db;

  const deps: HandlerDeps = {
    authedClient: (header) => (opts.noAuthedClient ? null : authedFor(header)),
    serviceClient: () => (opts.noServiceClient ? null : service),
    logUsage: (_admin, event) => {
      usage.push(event);
      return Promise.resolve('usage-row');
    },
    now: () => (clock += 25),
  };
  return { deps, rpcCalls, usage, service };
}

function call<A extends AuthMode, I>(
  config: HandlerConfig<A, I>,
  fn: HandlerFn<A, I>,
  req: Request,
  opts: StubOptions = {},
) {
  const s = stubs(opts);
  return { res: createHandler(config, fn, s.deps)(req), ...s };
}

function post(body?: string, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request('https://x.supabase.co/functions/v1/demo', { method, headers, body });
}

const signedIn = { Authorization: 'Bearer good' };
const echo: HandlerFn<AuthMode, unknown> = ({ input, user }) => ({ input, user: user?.id ?? null });

/** Status and the exact body text, so key order counts as it does for the app. */
async function exact(res: Promise<Response> | Response): Promise<[number, string]> {
  const r = await res;
  return [r.status, await r.text()];
}

// ---- CORS and method ----

Deno.test('OPTIONS answers the preflight with CORS headers, before anything else', async () => {
  const res = await call({ name: 'demo', auth: 'user' }, echo, post(undefined, {}, 'OPTIONS')).res;
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('a wrong method gets the legacy 405 body', async () => {
  const { res } = call({ name: 'demo', auth: 'none', legacyErrorShape: true }, echo, post(undefined, {}, 'GET'));
  assertEquals(await exact(res), [405, '{"error":"Method not allowed"}']);
});

Deno.test('a wrong method gets the standard 405 body without legacyErrorShape', async () => {
  const { res } = call({ name: 'demo', auth: 'none' }, echo, post(undefined, {}, 'PUT'));
  assertEquals(await exact(res), [
    405,
    '{"status":"failed","code":"method_not_allowed","message":"Method not allowed."}',
  ]);
});

Deno.test('cors: false sends no CORS headers and treats OPTIONS as a wrong method', async () => {
  const { res } = call({ name: 'demo', auth: 'webhook', cors: false, legacyErrorShape: true }, echo, post(undefined, {}, 'OPTIONS'));
  const r = await res;
  assertEquals(r.status, 405);
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), null);
  assertEquals(r.headers.get('Content-Type'), 'application/json');
});

Deno.test('methods lets GET through, and GET reads no body', async () => {
  const { res } = call({ name: 'demo', auth: 'none', methods: ['GET', 'POST'] }, echo, post(undefined, {}, 'GET'));
  // No body read, so input is undefined and drops out of the JSON.
  assertEquals(await exact(res), [200, '{"user":null}']);
});

// ---- body ----

Deno.test('a Content-Length over the limit is refused before auth', async () => {
  const { res, rpcCalls } = call(
    { name: 'demo', auth: 'user', maxBodyBytes: 10, legacyErrorShape: true },
    echo,
    post('{}', { 'content-length': '11' }),
  );
  assertEquals(await exact(res), [400, '{"error":"Request payload is too large"}']);
  assertEquals(rpcCalls.length, 0);
});

Deno.test('a body over the limit is refused on its real bytes (multi-byte characters count)', async () => {
  // 4 Hebrew letters are 8 bytes, plus the quotes: 10 bytes.
  const { res } = call(
    { name: 'demo', auth: 'none', maxBodyBytes: 9, legacyErrorShape: true },
    echo,
    post('"שלום"'),
  );
  assertEquals(await exact(res), [400, '{"error":"Request payload is too large"}']);
});

Deno.test('a body at the limit is accepted', async () => {
  const { res } = call({ name: 'demo', auth: 'none', maxBodyBytes: 10 }, echo, post('"שלום"'));
  assertEquals(await exact(res), [200, '{"input":"שלום","user":null}']);
});

Deno.test('invalid JSON gets the legacy 400 body', async () => {
  const { res } = call({ name: 'demo', auth: 'none', legacyErrorShape: true }, echo, post('{nope'));
  assertEquals(await exact(res), [400, '{"error":"Invalid JSON body"}']);
});

Deno.test('an empty body is invalid JSON unless emptyBody is set', async () => {
  const strict = call({ name: 'demo', auth: 'none', legacyErrorShape: true }, echo, post(''));
  assertEquals((await strict.res).status, 400);
  const lenient = call({ name: 'demo', auth: 'none', emptyBody: {} }, echo, post(''));
  assertEquals(await exact(lenient.res), [200, '{"input":{},"user":null}']);
});

Deno.test("body: 'text' hands over the raw string, for signature checks", async () => {
  const { res } = call({ name: 'demo', auth: 'webhook', body: 'text' }, echo, post('{"raw": true}'));
  assertEquals(await exact(res), [200, '{"input":"{\\"raw\\": true}","user":null}']);
});

Deno.test("body: 'none' leaves the body unread", async () => {
  const req = post('{nope');
  const { res } = call({ name: 'demo', auth: 'none', body: 'none' }, echo, req);
  assertEquals((await res).status, 200);
  assertEquals(req.bodyUsed, false);
});

// ---- auth ----

Deno.test("auth 'user': no Authorization header gets authMissing", async () => {
  const { res } = call({ name: 'demo', auth: 'user', legacyErrorShape: true }, echo, post('{}'));
  assertEquals(await exact(res), [401, '{"error":"Missing Authorization header"}']);
});

Deno.test("auth 'user': a token that isn't a signed-in user gets authInvalid", async () => {
  const { res } = call({ name: 'demo', auth: 'user', legacyErrorShape: true }, echo, post('{}', { Authorization: 'Bearer anon' }));
  assertEquals(await exact(res), [401, '{"error":"Unauthorized"}']);
});

Deno.test("auth 'user': a function's own auth bodies replace the defaults (translate-recipe's)", async () => {
  const authRequired = new HttpError(401, 'auth_required', 'Sign in to translate recipes.');
  const config = {
    name: 'translate-recipe',
    auth: 'user' as const,
    legacyErrorShape: true,
    errors: { authMissing: authRequired, authInvalid: authRequired },
  };
  const expected = '{"status":"failed","code":"auth_required","message":"Sign in to translate recipes."}';
  assertEquals(await exact(call(config, echo, post('{}')).res), [401, expected]);
  assertEquals(await exact(call(config, echo, post('{}', { Authorization: 'Bearer anon' })).res), [401, expected]);
});

Deno.test("auth 'user': the handler gets the user, the caller's client and the service client", async () => {
  let seen: { user: string; hasAuthed: boolean; admin: unknown } | null = null;
  const s = stubs({ userId: 'user-7' });
  const res = await createHandler(
    { name: 'demo', auth: 'user' },
    ({ user, authed, admin }) => {
      seen = { user: user.id, hasAuthed: Boolean(authed), admin };
      return { ok: true };
    },
    s.deps,
  )(post('{}', signedIn));
  assertEquals(res.status, 200);
  assertEquals(seen, { user: 'user-7', hasAuthed: true, admin: s.service });
});

Deno.test('auth is checked before the body is read', async () => {
  const { res } = call({ name: 'demo', auth: 'user', legacyErrorShape: true }, echo, post('{nope'));
  assertEquals(await exact(res), [401, '{"error":"Missing Authorization header"}']);
});

Deno.test("auth 'admin': admins get through", async () => {
  const { res, rpcCalls } = call({ name: 'demo', auth: 'admin' }, echo, post('{}', signedIn), { isAdmin: true });
  assertEquals(await exact(res), [200, '{"input":{},"user":"user-1"}']);
  assertEquals(rpcCalls, [{ fn: 'is_current_user_admin' }]);
});

Deno.test("auth 'admin': others get the legacy 403", async () => {
  const { res } = call({ name: 'demo', auth: 'admin', legacyErrorShape: true }, echo, post('{}', signedIn), { isAdmin: false });
  assertEquals(await exact(res), [403, '{"error":"Admins only"}']);
});

Deno.test("auth 'admin': a failed admin check is a 500, not a 403", async () => {
  const { res } = call({ name: 'demo', auth: 'admin', legacyErrorShape: true }, echo, post('{}', signedIn), { isAdmin: 'error' });
  assertEquals(await exact(res), [500, '{"error":"Could not verify admin"}']);
});

Deno.test("auth 'admin': the backfills' own 'Sign in required' replaces authInvalid", async () => {
  const { res } = call(
    { name: 'demo', auth: 'admin', legacyErrorShape: true, errors: { authInvalid: HttpError.legacy(401, 'Sign in required') } },
    echo,
    post('{}', { Authorization: 'Bearer anon' }),
  );
  assertEquals(await exact(res), [401, '{"error":"Sign in required"}']);
});

Deno.test("auth 'optional': guests get user null; requireUser() throws the function's own body", async () => {
  const signIn = new HttpError(401, 'auth_required', 'Sign in to match your fridge.');
  const config = { name: 'demo', auth: 'optional' as const, errors: { authMissing: signIn, authInvalid: signIn } };
  const guest = call(config, ({ user }) => ({ user: user?.id ?? null }), post('{}'));
  assertEquals(await exact(guest.res), [200, '{"user":null}']);

  const required = call(config, ({ requireUser }) => ({ user: requireUser().id }), post('{}', { Authorization: 'Bearer anon' }));
  assertEquals(await exact(required.res), [
    401,
    '{"status":"failed","code":"auth_required","message":"Sign in to match your fridge."}',
  ]);

  const member = call(config, ({ requireUser }) => ({ user: requireUser().id }), post('{}', signedIn));
  assertEquals(await exact(member.res), [200, '{"user":"user-1"}']);
});

const cronSecret = { header: 'x-email-cron-secret', rpc: 'email_cron_secret_matches' as const };

Deno.test("auth 'secret': the right secret gets through, checked by the RPC", async () => {
  const { res, rpcCalls } = call(
    // welcome-emails reads no body, and the cron job sends an empty one.
    { name: 'welcome-emails', auth: 'secret', secret: cronSecret, legacyErrorShape: true, body: 'none' },
    () => ({ sent: 0, failed: 0 }),
    post('', { 'x-email-cron-secret': 's3cret' }),
    { secretMatches: true },
  );
  assertEquals(await exact(res), [200, '{"sent":0,"failed":0}']);
  assertEquals(rpcCalls, [{ fn: 'email_cron_secret_matches', args: { p_secret: 's3cret' } }]);
});

Deno.test("auth 'secret': a wrong or missing secret gets the legacy 401", async () => {
  const config = { name: 'welcome-emails', auth: 'secret' as const, secret: cronSecret, legacyErrorShape: true };
  const wrong = call(config, echo, post('{}', { 'x-email-cron-secret': 'nope' }), { secretMatches: false });
  assertEquals(await exact(wrong.res), [401, '{"error":"Unauthorized"}']);
  // An empty secret is refused even if the RPC said yes.
  const missing = call(config, echo, post('{}'), { secretMatches: true });
  assertEquals(await exact(missing.res), [401, '{"error":"Unauthorized"}']);
});

Deno.test("auth 'secret': a failed secret check is 'Secret check failed'", async () => {
  const { res } = call(
    { name: 'welcome-emails', auth: 'secret', secret: cronSecret, legacyErrorShape: true },
    echo,
    post('{}', { 'x-email-cron-secret': 's3cret' }),
    { secretMatches: 'error' },
  );
  assertEquals(await exact(res), [500, '{"error":"Secret check failed"}']);
});

Deno.test("auth 'secret' without a secret config fails at start-up", () => {
  let thrown = false;
  try {
    createHandler({ name: 'demo', auth: 'secret' }, echo, stubs().deps);
  } catch {
    thrown = true;
  }
  assertEquals(thrown, true);
});

Deno.test('a missing service client is misconfigured', async () => {
  const { res } = call({ name: 'demo', auth: 'none', legacyErrorShape: true }, echo, post('{}'), { noServiceClient: true });
  assertEquals(await exact(res), [500, '{"error":"Server misconfigured"}']);
});

Deno.test('a missing user client is misconfigured', async () => {
  const { res } = call({ name: 'demo', auth: 'user', legacyErrorShape: true }, echo, post('{}', signedIn), { noAuthedClient: true });
  assertEquals(await exact(res), [500, '{"error":"Server misconfigured"}']);
});

// ---- input ----

Deno.test('a parse function shapes the input and throws its own 400 bodies', async () => {
  const input = (raw: unknown) => {
    const title = (raw as { title?: unknown })?.title;
    if (typeof title !== 'string') throw HttpError.legacy(400, 'Missing "recipe.title" in request body');
    return { title: title.trim() };
  };
  const ok = call({ name: 'demo', auth: 'none', input }, ({ input }) => input, post('{"title":"  Soup "}'));
  assertEquals(await exact(ok.res), [200, '{"title":"Soup"}']);
  const bad = call({ name: 'demo', auth: 'none', input }, ({ input }) => input, post('{}'));
  assertEquals(await exact(bad.res), [400, '{"error":"Missing \\"recipe.title\\" in request body"}']);
});

Deno.test('a schema answers with its first issue, in either shape', async () => {
  const schema = {
    safeParse: (data: unknown) =>
      data === 'ok'
        ? { success: true as const, data: 'ok' }
        : { success: false as const, error: { issues: [{ message: 'Expected ok' }, { message: 'second' }] } },
  };
  const standard = call({ name: 'demo', auth: 'none', input: schema }, echo, post('"no"'));
  assertEquals(await exact(standard.res), [400, '{"status":"failed","code":"invalid_input","message":"Expected ok"}']);
  const legacy = call({ name: 'demo', auth: 'none', input: schema, legacyErrorShape: true }, echo, post('"no"'));
  assertEquals(await exact(legacy.res), [400, '{"error":"Expected ok"}']);
  const ok = call({ name: 'demo', auth: 'none', input: schema }, ({ input }) => ({ input }), post('"ok"'));
  assertEquals(await exact(ok.res), [200, '{"input":"ok"}']);
});

// ---- results and errors ----

Deno.test('a returned object is a 200 JSON response with CORS headers', async () => {
  const r = await call({ name: 'demo', auth: 'none' }, () => ({ status: 'ok' }), post('{}')).res;
  assertEquals(r.status, 200);
  assertEquals(r.headers.get('Content-Type'), 'application/json');
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('a returned Response goes out untouched', async () => {
  const page = new Response('Unsubscribed', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const r = await call({ name: 'demo', auth: 'none' }, () => page, post('{}')).res;
  assertEquals(r, page);
});

Deno.test('a thrown HttpError keeps its status and exact body, extra fields last', async () => {
  const { res } = call(
    { name: 'demo', auth: 'none' },
    () => {
      throw new HttpError(429, 'daily_limit', 'daily_limit', { remix_daily_limit: 5 });
    },
    post('{}'),
  );
  assertEquals(await exact(res), [
    429,
    '{"status":"failed","code":"daily_limit","message":"daily_limit","remix_daily_limit":5}',
  ]);
});

Deno.test("HttpError.legacy keeps recipe-share's { error, code } order", async () => {
  const { res } = call(
    { name: 'demo', auth: 'none' },
    () => {
      throw HttpError.legacy(404, 'Share not found', { code: 'share_not_found' });
    },
    post('{}'),
  );
  assertEquals(await exact(res), [404, '{"error":"Share not found","code":"share_not_found"}']);
});

Deno.test('HttpError can carry a 200 (translate-recipe answers some failures that way)', async () => {
  const { res } = call(
    { name: 'demo', auth: 'none' },
    () => {
      throw new HttpError(200, 'translation_empty', "Couldn't translate this recipe. Try again.");
    },
    post('{}'),
  );
  assertEquals(await exact(res), [
    200,
    '{"status":"failed","code":"translation_empty","message":"Couldn\'t translate this recipe. Try again."}',
  ]);
});

Deno.test("HttpError.withBody sends auth-email's hook error as is, without CORS", async () => {
  const r = await call(
    { name: 'auth-email', auth: 'webhook', cors: false },
    () => {
      throw HttpError.withBody(401, { error: { http_code: 401, message: 'Invalid signature' } });
    },
    post('{}'),
  ).res;
  assertEquals(await exact(r), [401, '{"error":{"http_code":401,"message":"Invalid signature"}}']);
  assertEquals(r.headers.get('Access-Control-Allow-Origin'), null);
});

Deno.test('fail() hands the handler the configured body for a built-in failure', async () => {
  const { res } = call(
    { name: 'nudges', auth: 'none', methods: ['GET', 'POST'], legacyErrorShape: true },
    ({ fail }) => {
      throw fail('methodNotAllowed');
    },
    post(undefined, {}, 'GET'),
  );
  assertEquals(await exact(res), [405, '{"error":"Method not allowed"}']);
});

Deno.test('an unexpected error goes up to serve() for its 500 and Sentry report', async () => {
  const { res } = call(
    { name: 'demo', auth: 'none' },
    () => {
      throw new TypeError('boom');
    },
    post('{}'),
  );
  await assertRejects(() => res, TypeError, 'boom');
});

// ---- usage log ----

Deno.test('log.usage fills in the user and the duration', async () => {
  const s = stubs({ userId: 'user-9' });
  await createHandler(
    { name: 'demo', auth: 'user' },
    async ({ log }) => {
      await log.usage({ action: 'translate', status: 'ok', tokensCharged: 0 });
      await log.usage({ action: 'translate', status: 'ok', userId: null, durationMs: 5 });
      return {};
    },
    s.deps,
  )(post('{}', signedIn));
  assertEquals(s.usage[0].userId, 'user-9');
  assertEquals(typeof s.usage[0].durationMs, 'number');
  assertEquals((s.usage[0].durationMs ?? 0) > 0, true);
  assertEquals(s.usage[1].userId, null);
  assertEquals(s.usage[1].durationMs, 5);
});
