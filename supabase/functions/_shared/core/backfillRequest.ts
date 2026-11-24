import { HttpError } from './httpError.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The admin backfills' body, read the way they always read it: `Content-Length: 0` is `{}`, anything else is parsed
 * as JSON. So an empty body sent without a Content-Length is 'Invalid JSON body'. The wrapper's `emptyBody` can't
 * tell the two apart, so these functions use `body: 'none'` and call this. Like before, a body that is JSON but not
 * an object is returned as is (`null` makes the caller's first field read throw, which is a 500).
 */
export async function readBackfillBody(req: Request): Promise<unknown> {
  if (req.headers.get('content-length') === '0') return {};
  try {
    return await req.json();
  } catch {
    throw HttpError.legacy(400, 'Invalid JSON body');
  }
}

/** `after` as a row id (the previous response's next_cursor), or null to start. Anything else is the old 400. */
export function parseUuidCursor(value: unknown): string | null {
  const after = value ?? null;
  if (after !== null && (typeof after !== 'string' || !UUID.test(after))) {
    throw HttpError.legacy(400, 'after must be a next_cursor value');
  }
  return after as string | null;
}
