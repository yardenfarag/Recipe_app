// Turning non-essential email (tips, reminders, welcome) off and back on from a signed link (PIN-189). No sign-in:
// the link carries the account and its token (email_unsubscribe_token).
//   POST JSON { user_id, token, opt_out }: the pinch-app.io/app/unsubscribe page. Answers { status: 'ok', opt_out }.
//   POST ?u=&t=: a mail app's one-click unsubscribe (List-Unsubscribe-Post, RFC 8058). Always unsubscribes.
//   GET ?u=&t=&l=: someone opened the List-Unsubscribe address in a browser. Sends them to the page.
import { handler, HttpError } from '../_shared/core/handler.ts';
import { readPreferenceRequest, redirectToUnsubscribePage, setEmailOptOut } from '../_shared/email/unsubscribe.ts';

const invalidLink = new HttpError(400, 'invalid_link', 'This link didn’t work.');

handler(
  {
    name: 'email-preferences',
    auth: 'none',
    methods: ['GET', 'POST'],
    // A mail app's one-click POST is a form, not JSON.
    body: 'text',
    maxBodyBytes: 4_000,
  },
  async ({ req, input, admin }) => {
    const url = new URL(req.url);
    if (req.method === 'GET') return redirectToUnsubscribePage(url);

    const request = readPreferenceRequest(url, typeof input === 'string' ? input : '');
    if (!request || !(await setEmailOptOut(admin, request))) throw invalidLink;
    return { status: 'ok', opt_out: request.optOut };
  },
);
