/**
 * The handler wrapper every Edge Function is built on (ADR 024 §3, PIN-34). An index.ts is a config object and a
 * handler; the wrapper does the steps every function used to repeat by hand, always in this order:
 *
 * 1. CORS preflight, then the method check
 * 2. the Content-Length check against `maxBodyBytes`
 * 3. auth (see `AuthMode`), then the service client
 * 4. reading the body (size checked on the real bytes) and parsing JSON
 * 5. input validation (`input`: a parse function or a zod-style schema)
 * 6. the handler. It returns a JSON-able object (sent as 200) or a Response. Throw `HttpError` for expected
 *    failures. Anything else goes up to `serve()` in observe.ts: a 500, a log line and a Sentry report.
 *
 * Converted functions keep their old responses byte for byte. Set `legacyErrorShape` for the old `{ error }` bodies,
 * and override any built-in failure in `errors`. A function whose old order differs (it read the body before
 * checking sign-in, say) uses `auth: 'optional'` and calls `requireUser()` where the old check was.
 */
import type { User } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

import { corsHeaders } from './cors.ts';
import { HttpError, jsonBody } from './httpError.ts';
import { currentRequest, serve } from './observe.ts';
import { createAuthedSupabase, createServiceSupabase, type Db } from './supabaseAdmin.ts';
import { logUsageEvent, type UsageEventInput } from './usageLog.ts';

export { HttpError } from './httpError.ts';
export type { User };

/**
 * - `user`: a signed-in user is required.
 * - `admin`: a signed-in user for whom `is_current_user_admin()` is true.
 * - `optional`: the user if the token is valid, else null (guests). `requireUser()` asks for one later.
 * - `secret`: a shared secret in a header, checked by an RPC (cron jobs and database triggers).
 * - `webhook`: the function checks the signature itself (read the raw body with `body: 'text'`).
 * - `none`: no auth.
 */
export type AuthMode = 'user' | 'admin' | 'optional' | 'secret' | 'webhook' | 'none';

/** The failures the wrapper answers by itself. Each has a default body; `errors` overrides it per function. */
export type FailureKey =
  | 'methodNotAllowed'
  | 'tooLarge'
  | 'invalidJson'
  /** No Authorization header (`user`, `admin`); `requireUser()` without one. */
  | 'authMissing'
  /** A token that isn't a signed-in user; a wrong or missing secret. */
  | 'authInvalid'
  /** The admin or secret RPC failed. */
  | 'authCheckFailed'
  /** Signed in, but not an admin. */
  | 'forbidden'
  /** A Supabase client couldn't be created (missing env). */
  | 'misconfigured';

export interface SecretCheck {
  header: string;
  rpc: 'email_cron_secret_matches' | 'support_email_secret_matches';
}

/** Anything with zod's `safeParse`. The wrapper doesn't import zod; a function that uses it pins `npm:zod@x.y.z`. */
export interface SchemaLike<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
}

/** A parse function throws `HttpError` with the function's own 400 bodies; a schema answers with its first issue. */
export type InputParser<T> = ((raw: unknown) => T) | SchemaLike<T>;

export interface HandlerConfig<A extends AuthMode, I> {
  name: string;
  auth: A;
  /** Required when `auth` is `secret`. */
  secret?: SecretCheck;
  /** Default `['POST']`. */
  methods?: string[];
  /** Answer OPTIONS and send CORS headers. Default true; false for server-to-server functions that never had them. */
  cors?: boolean;
  /** `json` (default), `text` (the raw string, for signature checks) or `none`. GET and HEAD never read a body. */
  body?: 'json' | 'text' | 'none';
  /** Checked against Content-Length before auth, and against the real bytes after. No limit when unset. */
  maxBodyBytes?: number;
  /** The input when the body is empty. Without it an empty body is invalid JSON. */
  emptyBody?: unknown;
  input?: InputParser<I>;
  /** Default bodies are the old `{ error }` shape instead of `{ status: 'failed', code, message }`. */
  legacyErrorShape?: boolean;
  errors?: Partial<Record<FailureKey, HttpError>>;
}

type Signed<A extends AuthMode, T> = A extends 'user' | 'admin' ? T : T | null;

export type UsageEvent = Omit<UsageEventInput, 'userId' | 'durationMs'> & {
  /** Default: the signed-in user's id. */
  userId?: string | null;
  /** Default: time since the request started. */
  durationMs?: number | null;
};

export interface HandlerContext<A extends AuthMode, I> {
  req: Request;
  input: I;
  user: Signed<A, User>;
  /** The caller's own client, under row level security. Set whenever there is an Authorization header. */
  authed: Signed<A, Db>;
  /** The service client, which bypasses row level security. Auth has been checked by the time you have it. */
  admin: Db;
  requestId: string;
  /** When the wrapper received the request (ms since epoch). */
  startedAt: number;
  /** The signed-in user, or the function's `authMissing` / `authInvalid` error. For `auth: 'optional'`. */
  requireUser(): User;
  /** The function's body for a built-in failure, to throw from the handler: `throw fail('methodNotAllowed')`. */
  fail(key: FailureKey): HttpError;
  log: {
    /** One row in ai_usage_events (cost tracking), with the user and duration filled in. */
    usage(event: UsageEvent): Promise<string | null>;
  };
}

export type HandlerResult = Response | Record<string, unknown> | unknown[];

export type HandlerFn<A extends AuthMode, I> = (ctx: HandlerContext<A, I>) => HandlerResult | Promise<HandlerResult>;

/** What the wrapper calls outside itself, passed in so tests can replace it. */
export interface HandlerDeps {
  authedClient(authHeader: string): Db | null;
  serviceClient(): Db | null;
  logUsage(admin: Db, event: UsageEventInput): Promise<string | null>;
  now(): number;
}

const STANDARD_ERRORS: Record<FailureKey, HttpError> = {
  methodNotAllowed: new HttpError(405, 'method_not_allowed', 'Method not allowed.'),
  tooLarge: new HttpError(413, 'payload_too_large', 'Request is too large.'),
  invalidJson: new HttpError(400, 'invalid_json', 'Invalid JSON body.'),
  authMissing: new HttpError(401, 'auth_required', 'Sign in to continue.'),
  authInvalid: new HttpError(401, 'auth_required', 'Sign in to continue.'),
  authCheckFailed: new HttpError(500, 'auth_check_failed', 'Something went wrong. Please try again.'),
  forbidden: new HttpError(403, 'forbidden', 'Not allowed.'),
  misconfigured: new HttpError(500, 'server_misconfigured', 'Server is not configured.'),
};

/** The bodies most functions wrote by hand before the wrapper. */
const LEGACY_ERRORS: Record<FailureKey, HttpError> = {
  methodNotAllowed: HttpError.legacy(405, 'Method not allowed'),
  tooLarge: HttpError.legacy(400, 'Request payload is too large'),
  invalidJson: HttpError.legacy(400, 'Invalid JSON body'),
  authMissing: HttpError.legacy(401, 'Missing Authorization header'),
  authInvalid: HttpError.legacy(401, 'Unauthorized'),
  authCheckFailed: HttpError.legacy(500, 'Could not verify admin'),
  forbidden: HttpError.legacy(403, 'Admins only'),
  misconfigured: HttpError.legacy(500, 'Server misconfigured'),
};

const LEGACY_SECRET_CHECK_FAILED = HttpError.legacy(500, 'Secret check failed');

function failuresFor<A extends AuthMode, I>(config: HandlerConfig<A, I>): Record<FailureKey, HttpError> {
  const defaults = config.legacyErrorShape
    ? { ...LEGACY_ERRORS, ...(config.auth === 'secret' ? { authCheckFailed: LEGACY_SECRET_CHECK_FAILED } : {}) }
    : STANDARD_ERRORS;
  return { ...defaults, ...config.errors };
}

function contentLengthOver(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

async function readBody<A extends AuthMode, I>(
  req: Request,
  config: HandlerConfig<A, I>,
  fail: Record<FailureKey, HttpError>,
): Promise<unknown> {
  const mode = config.body ?? 'json';
  if (mode === 'none' || req.method === 'GET' || req.method === 'HEAD') return undefined;

  let text: string;
  try {
    text = await req.text();
  } catch {
    throw fail.invalidJson;
  }
  if (config.maxBodyBytes !== undefined && new TextEncoder().encode(text).byteLength > config.maxBodyBytes) {
    throw fail.tooLarge;
  }
  if (mode === 'text') return text;
  if (text === '' && 'emptyBody' in config) return config.emptyBody;
  try {
    return JSON.parse(text);
  } catch {
    throw fail.invalidJson;
  }
}

function parseInput<I>(parser: InputParser<I> | undefined, raw: unknown, legacy: boolean): I {
  if (!parser) return raw as I;
  if (typeof parser === 'function') return parser(raw);
  const result = parser.safeParse(raw);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message ?? 'Invalid request.';
  throw legacy ? HttpError.legacy(400, message) : new HttpError(400, 'invalid_input', message);
}

async function signedInUser(authed: Db): Promise<User | null> {
  const { data, error } = await authed.auth.getUser();
  return error ? null : (data.user ?? null);
}

/** The request pipeline behind `handler()`, with its outside calls passed in so it can be tested. */
export function createHandler<A extends AuthMode, I = unknown>(
  config: HandlerConfig<A, I>,
  fn: HandlerFn<A, I>,
  deps: HandlerDeps,
): (req: Request) => Promise<Response> {
  if (config.auth === 'secret' && !config.secret) throw new Error(`${config.name}: auth 'secret' needs a secret`);
  const fail = failuresFor(config);
  const cors = config.cors !== false;
  const methods = config.methods ?? ['POST'];

  return async (req) => {
    const startedAt = deps.now();
    try {
      if (cors && req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
      if (!methods.includes(req.method)) throw fail.methodNotAllowed;
      if (config.maxBodyBytes !== undefined && contentLengthOver(req, config.maxBodyBytes)) throw fail.tooLarge;

      const authHeader = req.headers.get('Authorization');
      let user: User | null = null;
      let authed: Db | null = null;
      let admin: Db | null = null;

      switch (config.auth) {
        case 'user':
        case 'admin': {
          if (!authHeader) throw fail.authMissing;
          authed = deps.authedClient(authHeader);
          if (!authed) throw fail.misconfigured;
          user = await signedInUser(authed);
          if (!user) throw fail.authInvalid;
          if (config.auth === 'admin') {
            const { data: isAdmin, error } = await authed.rpc('is_current_user_admin');
            if (error) {
              console.error(`[${config.name}] admin check failed`, error);
              throw fail.authCheckFailed;
            }
            if (isAdmin !== true) throw fail.forbidden;
          }
          break;
        }
        case 'optional': {
          authed = authHeader ? deps.authedClient(authHeader) : null;
          user = authed ? await signedInUser(authed) : null;
          break;
        }
        case 'secret': {
          admin = deps.serviceClient();
          if (!admin) throw fail.misconfigured;
          const { header, rpc } = config.secret!;
          const given = req.headers.get(header) ?? '';
          const { data: ok, error } = await admin.rpc(rpc, { p_secret: given });
          if (error) {
            console.error(`[${config.name}] secret check failed`, error);
            throw fail.authCheckFailed;
          }
          if (!given || ok !== true) throw fail.authInvalid;
          break;
        }
        case 'webhook':
        case 'none':
          break;
      }

      admin ??= deps.serviceClient();
      if (!admin) throw fail.misconfigured;
      const service = admin;

      const raw = await readBody(req, config, fail);
      const input = parseInput(config.input, raw, config.legacyErrorShape === true);

      const ctx: HandlerContext<AuthMode, I> = {
        req,
        input,
        user,
        authed,
        admin: service,
        requestId: currentRequest()?.requestId ?? crypto.randomUUID(),
        startedAt,
        requireUser() {
          if (user) return user;
          throw authHeader ? fail.authInvalid : fail.authMissing;
        },
        fail: (key) => fail[key],
        log: {
          usage: (event) =>
            deps.logUsage(service, {
              ...event,
              userId: event.userId === undefined ? (user?.id ?? null) : event.userId,
              durationMs: event.durationMs === undefined ? deps.now() - startedAt : event.durationMs,
            }),
        },
      };
      const result = await fn(ctx as HandlerContext<A, I>);
      return result instanceof Response ? result : jsonBody(result, 200, cors);
    } catch (err) {
      if (err instanceof HttpError) return err.toResponse(cors);
      throw err;
    }
  };
}

const liveDeps: HandlerDeps = {
  authedClient: createAuthedSupabase,
  serviceClient: createServiceSupabase,
  logUsage: logUsageEvent,
  now: Date.now,
};

/** Starts a function: `handler({ name, auth, ... }, async (ctx) => { ... })`. It calls `serve()` (observe.ts). */
export function handler<A extends AuthMode, I = unknown>(config: HandlerConfig<A, I>, fn: HandlerFn<A, I>): void {
  serve(config.name, createHandler(config, fn, liveDeps));
}
