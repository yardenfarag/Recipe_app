/**
 * Observability for every Edge Function (ADR 024 §5, PIN-37): a request id, one JSON log line per request, and Sentry
 * reports for unexpected errors. Each function's index.ts calls `serve('<name>', handler)` instead of `Deno.serve`.
 *
 * Sentry follows Supabase's guidance for Edge Functions: default integrations are off (they don't separate requests
 * when an instance is reused), so every report carries its request context explicitly. Nothing is sent without the
 * SENTRY_DSN secret, and no request bodies, recipe content or IP addresses are sent at all.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from 'npm:@sentry/deno@11.11.0';

import { corsHeaders } from './cors.ts';

export interface RequestContext {
  fn: string;
  /** `preview` when called as `<name>-preview` (deploy-function-preview.yml), else `production`. */
  environment: 'production' | 'preview';
  requestId: string;
  userId: string | null;
  /** Set once something was sent to Sentry, so the response waits for it to flush. */
  reported: boolean;
}

export interface RequestLog {
  fn: string;
  request_id: string;
  user_id: string | null;
  method: string;
  status: number;
  code: string | null;
  duration_ms: number;
}

export interface ObserveDeps {
  log: (line: RequestLog) => void;
  reportException: (err: unknown, ctx: RequestContext) => void;
  reportMessage: (message: string, ctx: RequestContext) => void;
  flush: () => Promise<unknown>;
}

const requestStore = new AsyncLocalStorage<RequestContext>();

/** The current request's context (fn, request id, user id), or undefined outside a request. */
export function currentRequest(): RequestContext | undefined {
  return requestStore.getStore();
}

/**
 * The user id in a signed-in user's JWT, for logs and error reports only. It is not verified here; the gateway
 * (verify_jwt) or the function itself does that. The anon key and webhook signatures give null.
 */
export function userIdFromAuthHeader(header: string | null): string | null {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json?.role === 'authenticated' && typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

/** A short error code from a JSON error response (`code`, else a short `error`), for the log line. */
export async function errorCodeOf(res: Response): Promise<string | null> {
  if (res.status < 400 || !res.headers.get('Content-Type')?.includes('application/json')) return null;
  try {
    const body = await res.clone().json();
    if (typeof body?.code === 'string') return body.code.slice(0, 80);
    if (typeof body?.error === 'string') return body.error.slice(0, 80);
  } catch {
    // Not JSON after all; the status says enough.
  }
  return null;
}

function requestIdOf(req: Request): string {
  const sent = req.headers.get('x-request-id')?.trim();
  return sent && sent.length >= 8 && sent.length <= 128 ? sent : crypto.randomUUID();
}

function withRequestId(res: Response, requestId: string): Response {
  try {
    res.headers.set('x-request-id', requestId);
    return res;
  } catch {
    // Some responses have immutable headers; copy them.
    const headers = new Headers(res.headers);
    headers.set('x-request-id', requestId);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
}

/** The request pipeline behind `serve`, with logging and reporting passed in so it can be tested. */
export function createRequestHandler(
  fn: string,
  handler: (req: Request) => Response | Promise<Response>,
  deps: ObserveDeps,
): (req: Request) => Promise<Response> {
  return (req) => {
    if (req.method === 'OPTIONS') return Promise.resolve(handler(req));

    const ctx: RequestContext = {
      fn,
      environment: /\/functions\/v1\/[^/]+-preview(\/|$)/.test(new URL(req.url).pathname) ? 'preview' : 'production',
      requestId: requestIdOf(req),
      userId: userIdFromAuthHeader(req.headers.get('Authorization')),
      reported: false,
    };
    const started = Date.now();

    return requestStore.run(ctx, async () => {
      let res: Response;
      let code: string | null;
      try {
        // Checks the Sentry pipeline end to end. Only on -preview copies, never on the real functions.
        if (ctx.environment === 'preview' && req.headers.get('x-observe-test') === 'error') {
          throw new Error(`Observability test error from ${fn}-preview`);
        }
        res = await handler(req);
        code = await errorCodeOf(res);
        if (res.status >= 500 && !ctx.reported) {
          deps.reportMessage(`${fn} responded ${res.status}${code ? ` (${code})` : ''}`, ctx);
          ctx.reported = true;
        }
      } catch (err) {
        deps.reportException(err, ctx);
        ctx.reported = true;
        code = 'internal_error';
        res = new Response(JSON.stringify({ status: 'failed', code, message: 'Something went wrong. Please try again.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      deps.log({
        fn,
        request_id: ctx.requestId,
        user_id: ctx.userId,
        method: req.method,
        status: res.status,
        code,
        duration_ms: Date.now() - started,
      });
      // The instance can be frozen right after the response, so reports go out first.
      if (ctx.reported) await deps.flush().catch(() => {});
      return withRequestId(res, ctx.requestId);
    });
  };
}

// ---- Sentry ----

let sentryReady: boolean | null = null;

function sentryEnabled(): boolean {
  if (sentryReady !== null) return sentryReady;
  const dsn = Deno.env.get('SENTRY_DSN');
  sentryReady = Boolean(dsn);
  if (dsn) {
    Sentry.init({
      dsn,
      defaultIntegrations: false,
      tracesSampleRate: 0,
      // Collect nothing automatically: no bodies (recipes, prompts), headers (tokens), cookies, query params or AI
      // inputs/outputs. Reports carry only what sentryScope sets: function, request id, user id.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
      },
    });
    Sentry.setTag('region', Deno.env.get('SB_REGION') ?? 'unknown');
  }
  return sentryReady;
}

function sentryScope(ctx: RequestContext | undefined, fn: (scope: Sentry.Scope) => void) {
  if (!sentryEnabled()) return;
  Sentry.withScope((scope) => {
    if (ctx) {
      scope.setTag('function', ctx.fn);
      scope.setTag('request_id', ctx.requestId);
      scope.setTag('environment', ctx.environment);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
    }
    scope.setTag('execution_id', Deno.env.get('SB_EXECUTION_ID') ?? 'unknown');
    fn(scope);
  });
}

const sentryDeps: ObserveDeps = {
  log: (line) => console.log(JSON.stringify(line)),
  reportException: (err, ctx) => sentryScope(ctx, () => Sentry.captureException(err)),
  reportMessage: (message, ctx) => sentryScope(ctx, () => Sentry.captureMessage(message, 'error')),
  flush: () => (sentryEnabled() ? Sentry.flush(2000) : Promise.resolve(true)),
};

// Existing catch blocks log failures with console.error(message, err). Report those too, with the stack, so they
// reach Sentry without editing every function. Only calls that include an Error object are reported.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  const err = args.find((arg) => arg instanceof Error);
  if (!err) return;
  const ctx = requestStore.getStore();
  const context = args.filter((arg) => typeof arg === 'string').join(' ').slice(0, 200);
  try {
    sentryScope(ctx, (scope) => {
      if (context) scope.setExtra('log_message', context);
      Sentry.captureException(err);
    });
    if (ctx && sentryEnabled()) ctx.reported = true;
  } catch {
    // Reporting must never break the function.
  }
};

/** Starts the function: `serve('translate-recipe', async (req) => { ... })` in place of `Deno.serve`. */
export function serve(fn: string, handler: (req: Request) => Response | Promise<Response>): void {
  Deno.serve(createRequestHandler(fn, handler, sentryDeps));
}
