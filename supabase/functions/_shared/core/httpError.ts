import { corsHeaders } from './cors.ts';

/**
 * An expected failure. Throw it anywhere under a `handler()` (ADR 024 §3) and the wrapper answers with exactly this
 * status and JSON body; nothing is reported to Sentry unless the status is 5xx.
 *
 * - `new HttpError(429, 'daily_limit', 'daily_limit')` gives `{ status: 'failed', code, message }`, the shape new
 *   functions use. Extra fields go after them: `new HttpError(429, 'daily_limit', 'daily_limit', { remix_daily_limit: 5 })`.
 * - `HttpError.legacy(400, 'Invalid JSON body')` gives the old `{ error }` body, with any extra fields after it
 *   (`{ error, code }` in recipe-share). Converted functions keep these: response shapes are a contract.
 * - `HttpError.withBody(status, body)` sends any other body as is (auth-email's hook errors).
 *
 * The status can be anything, 200 included: translate-recipe answers some failures with 200 and a failed body, and
 * throwing (not returning) is what makes `withDailyAiUsage` refund.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    extra: Record<string, unknown> = {},
    readonly body: Record<string, unknown> = { status: 'failed', code, message, ...extra },
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static legacy(status: number, error: string, extra: Record<string, unknown> = {}): HttpError {
    const code = typeof extra.code === 'string' ? extra.code : 'error';
    return new HttpError(status, code, error, {}, { error, ...extra });
  }

  static withBody(status: number, body: Record<string, unknown>, code = 'error'): HttpError {
    return new HttpError(status, code, code, {}, body);
  }

  toResponse(cors = true): Response {
    return jsonBody(this.body, this.status, cors);
  }
}

/** A JSON response. With `cors` (the default) it carries the CORS headers, like `jsonResponse` in cors.ts. */
export function jsonBody(body: unknown, status = 200, cors = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors ? { ...corsHeaders, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
  });
}
