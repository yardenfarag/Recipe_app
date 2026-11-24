import { HttpError } from '../core/httpError.ts';

const MAX_BODY_BYTES = 32_000;
const ACTIONS = ['create', 'get', 'claim', 'revoke', 'status'];

export type ShareAction = 'create' | 'get' | 'claim' | 'revoke' | 'status';

export interface ShareRequest {
  action: ShareAction;
  recipe_id?: string;
  token?: string;
}

const invalidJson = HttpError.legacy(400, 'Invalid JSON body');

/**
 * recipe-share's request, from the raw body text (`body: 'text'`), checked in the old order before any sign-in
 * check: an empty body is invalid JSON, then the size of the real bytes, then the JSON, then the action. Like the
 * code it came from, JSON `null` makes the action read throw a TypeError, which is a 500.
 */
export function parseShareRequest(raw: unknown): ShareRequest {
  const text = raw as string;
  if (!text) throw invalidJson;
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw HttpError.legacy(400, 'Request payload is too large');
  }
  let body: Partial<ShareRequest>;
  try {
    body = JSON.parse(text) as Partial<ShareRequest>;
  } catch {
    throw invalidJson;
  }

  const action = body.action;
  if (!ACTIONS.includes(action as string)) throw HttpError.legacy(400, 'Invalid action');
  return body as ShareRequest;
}
