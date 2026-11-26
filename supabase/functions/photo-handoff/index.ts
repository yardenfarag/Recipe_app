import { handler, HttpError } from '../_shared/core/handler.ts';
import {
  HANDOFF_PURPOSES,
  HANDOFF_TTL_MS,
  type HandoffPurpose,
  handoffGone,
  handoffState,
  hashHandoffToken,
  isHandoffToken,
  MAX_HANDOFFS_PER_HOUR,
  MAX_UPLOADS_PER_HANDOFF,
  newHandoffToken,
  openHandoffByToken,
  ownHandoff,
  parkPhoto,
  takePhoto,
  tooManyHandoffs,
  tooManyUploads,
} from '../_shared/pantry/photoHandoff.ts';
import { MAX_PHOTO_BODY_BYTES, parsePhoto } from '../_shared/pantry/photoInput.ts';
import { parseLanguage, parsePlace, parseScanId, scanOnePhoto } from '../_shared/pantry/recordScan.ts';

const badAction = new HttpError(400, 'invalid_action', 'Unknown action.');
const badPurpose = new HttpError(400, 'invalid_purpose', 'Unknown purpose.');

type Body = Record<string, unknown>;

/**
 * POST { action, ... } (PIN-181, ADR 033). "Use your phone's camera" for the web app.
 *
 * From the computer, signed in:
 *   create { purpose: pantry|snap|guess, scan_id? (pantry), place?, language } -> { handoff: { id, token, expires_at } }
 *   status { handoff_id } -> { state: waiting|connected|photo_ready|closed|expired }
 *   take   { handoff_id } -> { photo: { image_base64, mime } | null }   (Snap and Guess; deletes the photo)
 *   close  { handoff_id }
 * From the phone, with the link's token and no sign-in:
 *   open   { token } -> { purpose, place, language, expires_at }
 *   upload { token, image_base64, place? } -> pantry: { photo } (read now, as the owner) | snap, guess: { sent: true }
 *   finish { token }   "I'm done": closes the link, which the computer sees as state 'closed'
 */
handler(
  {
    name: 'photo-handoff',
    auth: 'optional',
    maxBodyBytes: MAX_PHOTO_BODY_BYTES,
    input: (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Body,
  },
  async ({ input, admin, requireUser, log }) => {
    const action = input.action;

    if (action === 'create') {
      const user = requireUser();
      const purpose = input.purpose as HandoffPurpose;
      if (!(HANDOFF_PURPOSES as readonly string[]).includes(String(purpose))) throw badPurpose;
      const { data: allowed, error: rateError } = await admin.rpc('take_rate_limit', {
        p_bucket: 'photo_handoff_create',
        p_key: user.id,
        p_window: '1 hour',
        p_max: MAX_HANDOFFS_PER_HOUR,
      });
      if (rateError) throw rateError;
      if (allowed === false) throw tooManyHandoffs;

      const token = newHandoffToken();
      const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
      const { data, error } = await admin
        .from('photo_handoffs')
        .insert({
          user_id: user.id,
          token_hash: await hashHandoffToken(token),
          purpose,
          scan_id: purpose === 'pantry' ? parseScanId(input.scan_id) : null,
          place: input.place === undefined || input.place === null ? null : parsePlace(input.place),
          language: parseLanguage(input.language),
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (error || !data) throw error ?? new Error('handoff insert returned nothing');
      return { status: 'ok', handoff: { id: data.id, token, expires_at: expiresAt } };
    }

    if (action === 'status') {
      const row = await ownHandoff(admin, requireUser().id, input.handoff_id);
      return { status: 'ok', state: handoffState(row), connected_at: row.connected_at, expires_at: row.expires_at };
    }

    if (action === 'take') {
      const row = await ownHandoff(admin, requireUser().id, input.handoff_id);
      return { status: 'ok', photo: await takePhoto(admin, row) };
    }

    if (action === 'close') {
      const row = await ownHandoff(admin, requireUser().id, input.handoff_id);
      const { error } = await admin
        .from('photo_handoffs')
        .update({ closed_at: new Date().toISOString(), photo: null, photo_mime: null, photo_at: null })
        .eq('id', row.id);
      if (error) throw error;
      return { status: 'ok' };
    }

    if (action === 'finish') {
      // The phone's "I'm done": the link closes, and the computer's dialog sees it and closes too.
      if (!isHandoffToken(input.token)) throw handoffGone;
      const row = await openHandoffByToken(admin, input.token).catch(() => null);
      if (row) {
        const { error } = await admin.from('photo_handoffs').update({ closed_at: new Date().toISOString() }).eq('id', row.id);
        if (error) throw error;
      }
      return { status: 'ok' };
    }

    if (action === 'open' || action === 'upload') {
      if (!isHandoffToken(input.token)) throw handoffGone;
      const row = await openHandoffByToken(admin, input.token);
      if (!row.connected_at) {
        const connectedAt = new Date().toISOString();
        await admin.from('photo_handoffs').update({ connected_at: connectedAt }).eq('id', row.id);
        row.connected_at = connectedAt;
      }
      if (action === 'open') {
        return { status: 'ok', purpose: row.purpose, place: row.place, language: row.language, expires_at: row.expires_at };
      }

      const photo = parsePhoto(input.image_base64);
      const { data: allowed, error: rateError } = await admin.rpc('take_rate_limit', {
        p_bucket: 'photo_handoff_upload',
        p_key: row.id,
        p_window: '1 day',
        p_max: MAX_UPLOADS_PER_HANDOFF,
      });
      if (rateError) throw rateError;
      if (allowed === false) throw tooManyUploads;

      if (row.purpose !== 'pantry') {
        await parkPhoto(admin, row.id, photo);
        return { status: 'ok', sent: true };
      }
      const scanned = await scanOnePhoto({
        admin,
        userId: row.user_id,
        scanId: row.scan_id!,
        place: input.place === undefined ? (row.place ?? 'fridge') : parsePlace(input.place),
        language: row.language,
        photo,
        fromPhone: true,
        logUsage: (event) => log.usage({ ...event, userId: row.user_id }),
      });
      return { status: 'ok', photo: scanned };
    }

    throw badAction;
  },
);
