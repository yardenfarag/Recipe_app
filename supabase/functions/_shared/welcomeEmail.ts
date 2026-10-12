/**
 * Signup welcome email. No Deno APIs — vitest can import this file.
 * Keep the monthly credit count aligned with FREE_MONTHLY_EXTRACT_LIMIT.
 */

export const WELCOME_MONTHLY_CREDITS = 3;

export interface WelcomeEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface WelcomeEmailInput {
  appUrl: string;
  supportEmail?: string | null;
  monthlyCredits?: number;
}

const COLORS = {
  background: '#F4F1F8',
  surface: '#FFFFFF',
  text: '#2A2634',
  secondary: '#6E6878',
  primary: '#7B6B9A',
  soft: '#E8E2F0',
  accent: '#6B849E',
} as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Rejects header-injection and empty values. */
export function safeMailHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function safeHttpUrl(value: string | null | undefined): string {
  const trimmed = safeMailHeader(value);
  if (!trimmed || !/^https:\/\/[^\s]+$/i.test(trimmed)) return 'https://pinch-app.io';
  return trimmed.replace(/\/$/, '');
}

function safeEmail(value: string | null | undefined): string | null {
  const trimmed = safeMailHeader(value);
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function buildWelcomeEmail(input: WelcomeEmailInput): WelcomeEmailContent {
  const credits = input.monthlyCredits ?? WELCOME_MONTHLY_CREDITS;
  const appUrl = safeHttpUrl(input.appUrl);
  const supportEmail = safeEmail(input.supportEmail);
  const subject = `Welcome to Pinch — ${credits} free credits each month`;
  const preheader = `${credits} free recipe credits every month. Buy more whenever you need them.`;

  const supportHtml = supportEmail
    ? `<p style="margin:16px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:13px;line-height:20px;color:${COLORS.secondary};">Questions? Write to <a href="mailto:${escapeHtml(supportEmail)}" style="color:${COLORS.accent};text-decoration:underline;">${escapeHtml(supportEmail)}</a>.</p>`
    : '';
  const supportText = supportEmail ? `\nQuestions? ${supportEmail}\n` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.surface};border-radius:28px;">
          <tr>
            <td style="padding:36px 32px 12px;">
              <p style="margin:0;font-family:Georgia,'Iowan Old Style',serif;font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:${COLORS.primary};">Pinch</p>
              <h1 style="margin:18px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:32px;line-height:38px;font-weight:normal;color:${COLORS.text};">Welcome to your kitchen.</h1>
              <p style="margin:14px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:26px;color:${COLORS.secondary};">A video, a link, or a photo becomes ingredients and steps you can cook. Your account is ready.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.soft};border-radius:22px;">
                <tr>
                  <td style="padding:22px 22px 20px;">
                    <p style="margin:0;font-family:Georgia,'Iowan Old Style',serif;font-size:42px;line-height:46px;color:${COLORS.primary};">${credits}</p>
                    <p style="margin:4px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:22px;color:${COLORS.text};">free recipe credits</p>
                    <p style="margin:2px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:14px;line-height:20px;color:${COLORS.secondary};">every month</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;">
              <p style="margin:0;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:26px;color:${COLORS.text};">You get ${credits} free credits each month. They reset at the start of the next month (UTC), and they’re used before any credits you buy.</p>
              <p style="margin:14px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:26px;color:${COLORS.text};">One credit is used each time Snap or Guess the recipe succeeds.</p>
              <p style="margin:14px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:26px;color:${COLORS.text};">Need more than ${credits}? You can buy extra credits in the Pinch app. Purchased credits never expire — they stay until you use them.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${COLORS.primary};border-radius:18px;">
                    <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:14px 22px;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;line-height:20px;color:#ffffff;text-decoration:none;">Open Pinch</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;">
              <p style="margin:16px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:13px;line-height:20px;color:${COLORS.secondary};">You’re getting this because you created a Pinch account.</p>
              ${supportHtml}
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-family:Georgia,'Iowan Old Style',serif;font-size:12px;line-height:18px;color:${COLORS.secondary};">
          <a href="${escapeHtml(appUrl)}" style="color:${COLORS.secondary};text-decoration:none;">pinch-app.io</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to your kitchen.

A video, a link, or a photo becomes ingredients and steps you can cook. Your account is ready.

You get ${credits} free recipe credits every month. They reset at the start of the next month (UTC), and they’re used before any credits you buy.

One credit is used each time Snap or Guess the recipe succeeds.

Need more than ${credits}? You can buy extra credits in the Pinch app. Purchased credits never expire — they stay until you use them.

Open Pinch: ${appUrl}

You’re getting this because you created a Pinch account.
${supportText}`;

  return { subject, html, text };
}
