import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMessagePreferences,
  readUnsubscribeLink,
  saveMessagePreference,
  setEmailOptOutFromLink,
} from './emailPreferences';

// vi.mock is hoisted above the imports, so ./emailPreferences gets this client.
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
const query = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'update']) chain[method] = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn();
  return chain;
});
const from = vi.hoisted(() => vi.fn(() => query));
vi.mock('./client', () => ({ supabase: { functions, from } }));

const LINK = { userId: '10000000-0000-4000-8000-00000000aa01', token: 'a'.repeat(64) };

describe('message preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads both switches from the profile, on by default', async () => {
    query.maybeSingle.mockResolvedValue({ data: { email_opt_out: true, push_opt_out: false }, error: null });
    await expect(fetchMessagePreferences('u1')).resolves.toEqual({ emailOptOut: true, pushOptOut: false });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(query.select).toHaveBeenCalledWith('email_opt_out, push_opt_out');

    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchMessagePreferences('u1')).resolves.toEqual({ emailOptOut: false, pushOptOut: false });
  });

  it('saves one switch at a time', async () => {
    query.eq.mockImplementationOnce(() => Promise.resolve({ error: null }));
    await saveMessagePreference('u1', 'pushOptOut', true);
    expect(query.update).toHaveBeenCalledWith({ push_opt_out: true });
    expect(query.eq).toHaveBeenCalledWith('id', 'u1');

    query.eq.mockImplementationOnce(() => Promise.resolve({ error: { message: 'nope' } }));
    await expect(saveMessagePreference('u1', 'emailOptOut', false)).rejects.toEqual({ message: 'nope' });
    expect(query.update).toHaveBeenLastCalledWith({ email_opt_out: false });
  });

  it('reads an unsubscribe link only when it has both the account and the token', () => {
    expect(readUnsubscribeLink(new URLSearchParams(`u=${LINK.userId}&t=${LINK.token}&l=he`))).toEqual(LINK);
    expect(readUnsubscribeLink(new URLSearchParams(`u=${LINK.userId}`))).toBeNull();
    expect(readUnsubscribeLink(new URLSearchParams(''))).toBeNull();
  });

  it('turns email off or on from the link through email-preferences', async () => {
    functions.invoke.mockResolvedValue({ data: { status: 'ok', opt_out: false }, error: null });
    await expect(setEmailOptOutFromLink(LINK, false)).resolves.toBe('ok');
    expect(functions.invoke).toHaveBeenCalledWith('email-preferences', {
      body: { user_id: LINK.userId, token: LINK.token, opt_out: false },
    });
  });

  it('tells a bad link from a failure worth retrying', async () => {
    const httpError = (status: number, body: string) => new FunctionsHttpError(new Response(body, { status }));
    functions.invoke.mockResolvedValue({ data: null, error: httpError(400, JSON.stringify({ status: 'failed', code: 'invalid_link' })) });
    await expect(setEmailOptOutFromLink(LINK, true)).resolves.toBe('invalid_link');
    functions.invoke.mockResolvedValue({ data: null, error: httpError(500, '<html>oops</html>') });
    await expect(setEmailOptOutFromLink(LINK, true)).resolves.toBe('failed');
    functions.invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(setEmailOptOutFromLink(LINK, true)).resolves.toBe('failed');
  });
});
