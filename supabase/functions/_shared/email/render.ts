// Branded Pinch emails: one layout, five kinds. Email clients ignore <style> blocks and modern
// CSS, so this is tables and inline styles on purpose. Colours follow the website (landing/site.css):
// the Pinch pink on a warm cream page, with a white rounded card.
import { COPY, fill, isRtl, type EmailCopy, type EmailLocale } from './copy.ts';

export const SITE_URL = 'https://pinch-app.io';
export const APP_URL = `${SITE_URL}/app`;
const LOGO_URL = `${SITE_URL}/icon-192.png`;

const C = {
  page: '#f7f2f4',
  card: '#ffffff',
  ink: '#2a1620',
  muted: '#7a6670',
  pink: '#b24f6d',
  pinkSoft: '#fbe9ef',
  pinkLine: '#f0c9d6',
  line: '#efe4e8',
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paragraph text: escaped, with line breaks kept. */
function para(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

interface LayoutParts {
  locale: EmailLocale;
  subject: string;
  preheader: string;
  title: string;
  /** Already-safe HTML for the card body. */
  body: string;
}

function layout({ locale, subject, preheader, title, body }: LayoutParts): string {
  const copy = COPY[locale];
  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;" dir="${dir}">
    <tr><td align="center" style="padding:0 0 20px;">
      <a href="${SITE_URL}" style="text-decoration:none;">
        <img src="${LOGO_URL}" width="56" height="56" alt="Pinch" style="display:block;border:0;border-radius:16px;">
      </a>
    </td></tr>
    <tr><td style="background:${C.card};border-radius:24px;border:1px solid ${C.line};padding:36px 32px;font-family:${FONT};color:${C.ink};text-align:${align};">
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:800;color:${C.ink};">${escapeHtml(title)}</h1>
      ${body}
    </td></tr>
    <tr><td align="center" style="padding:24px 24px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted};">
      <div style="font-weight:700;color:${C.pink};font-size:14px;margin-bottom:6px;">${escapeHtml(copy.footerTagline)}</div>
      <div>${escapeHtml(copy.footerHelp)}</div>
      <div style="margin-top:10px;">${escapeHtml(copy.footerWhy)}<br><a href="${SITE_URL}" style="color:${C.muted};">pinch-app.io</a></div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function p(value: string, opts: { muted?: boolean; small?: boolean } = {}): string {
  const size = opts.small ? 14 : 16;
  const color = opts.muted ? C.muted : C.ink;
  return `<p style="margin:0 0 16px;font-size:${size}px;line-height:1.6;color:${color};">${para(value)}</p>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px;">
<tr><td align="center" style="border-radius:999px;background:${C.pink};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** Opens pinch-app.io/code.html, which copies the code (email apps can't run scripts). */
export function copyCodeUrl(code: string, locale: EmailLocale): string {
  return `${SITE_URL}/code.html?l=${locale}#${encodeURIComponent(code)}`;
}

/**
 * The code, big and spaced out, always left-to-right, even in Hebrew and Arabic. A tap selects
 * the whole code where the mail app allows it, and "Copy code" opens a page that copies it.
 */
function codeBlock(code: string, locale: EmailLocale): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">
<tr><td align="center" dir="ltr" style="background:${C.pinkSoft};border:2px dashed ${C.pinkLine};border-radius:18px;padding:20px 12px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:${C.pink};-webkit-user-select:all;user-select:all;">${escapeHtml(code)}</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;">
<tr><td align="center" style="border-radius:999px;border:2px solid ${C.pink};">
<a href="${escapeHtml(copyCodeUrl(code, locale))}" style="display:inline-block;padding:10px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.pink};text-decoration:none;border-radius:999px;">📋 ${escapeHtml(COPY[locale].codeCopy)}</a>
</td></tr></table>`;
}

function divider(): string {
  return `<div style="height:1px;background:${C.line};margin:8px 0 20px;"></div>`;
}

function textBlock(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join('\n\n') + `\n\n—\n${'Pinch · ' + SITE_URL}\n`;
}

// ── Sign-in code / reauthentication ───────────────────────────────────────

export function renderCodeEmail(input: {
  locale: EmailLocale;
  code: string;
  purpose: 'signin' | 'reauth';
}): RenderedEmail {
  const c = COPY[input.locale];
  const isReauth = input.purpose === 'reauth';
  const subject = fill(isReauth ? c.reauthSubject : c.codeSubject, { code: input.code });
  const title = isReauth ? c.reauthTitle : c.codeTitle;
  const intro = isReauth ? c.reauthIntro : c.codeIntro;
  const body = [p(intro), codeBlock(input.code, input.locale), p(c.codeExpiry, { muted: true, small: true }), p(c.codeIgnore, { muted: true, small: true })].join('\n');
  return {
    subject,
    html: layout({ locale: input.locale, subject, preheader: c.codePreheader, title, body }),
    text: textBlock(title, intro, input.code, c.codeExpiry, c.codeIgnore),
  };
}

// ── Password reset ────────────────────────────────────────────────────────

export function renderResetEmail(input: { locale: EmailLocale; code: string; link: string }): RenderedEmail {
  const c = COPY[input.locale];
  const body = [
    p(c.resetIntro),
    codeBlock(input.code, input.locale),
    p(c.codeExpiry, { muted: true, small: true }),
    divider(),
    p(c.resetButtonIntro, { small: true }),
    button(c.resetButton, input.link),
    p(c.resetIgnore, { muted: true, small: true }),
  ].join('\n');
  return {
    subject: c.resetSubject,
    html: layout({ locale: input.locale, subject: c.resetSubject, preheader: c.resetPreheader, title: c.resetTitle, body }),
    text: textBlock(c.resetTitle, c.resetIntro, input.code, c.codeExpiry, `${c.resetButtonIntro}\n${input.link}`, c.resetIgnore),
  };
}

// ── Email change ──────────────────────────────────────────────────────────

export function renderEmailChangeEmail(input: { locale: EmailLocale; link: string }): RenderedEmail {
  const c = COPY[input.locale];
  const body = [p(c.changeIntro), button(c.changeButton, input.link), p(c.changeIgnore, { muted: true, small: true })].join('\n');
  return {
    subject: c.changeSubject,
    html: layout({ locale: input.locale, subject: c.changeSubject, preheader: c.changePreheader, title: c.changeTitle, body }),
    text: textBlock(c.changeTitle, c.changeIntro, input.link, c.changeIgnore),
  };
}

// ── Welcome ───────────────────────────────────────────────────────────────

function featureRows(copy: EmailCopy, rtl: boolean): string {
  const align = rtl ? 'right' : 'left';
  const gap = rtl ? 'padding-left:14px;' : 'padding-right:14px;';
  return copy.welcomeFeatures
    .map(
      (f) => `<tr>
<td valign="top" width="44" style="${gap}padding-bottom:18px;">
  <div style="width:44px;height:44px;line-height:44px;border-radius:14px;background:${C.pinkSoft};text-align:center;font-size:22px;">${f.emoji}</div>
</td>
<td valign="top" style="padding-bottom:18px;text-align:${align};">
  <div style="font-size:16px;font-weight:700;line-height:1.4;color:${C.ink};margin:2px 0 2px;">${escapeHtml(f.title)}</div>
  <div style="font-size:14px;line-height:1.55;color:${C.muted};">${escapeHtml(f.body)}</div>
</td>
</tr>`,
    )
    .join('\n');
}

export function renderWelcomeEmail(input: { locale: EmailLocale }): RenderedEmail {
  const c = COPY[input.locale];
  const rtl = isRtl(input.locale);
  const body = [
    p(c.welcomeIntro),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;" dir="${rtl ? 'rtl' : 'ltr'}">${featureRows(c, rtl)}</table>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
<tr><td align="center" style="background:${C.pinkSoft};border-radius:18px;padding:18px 16px;">
  <div style="font-size:17px;font-weight:800;color:${C.pink};margin-bottom:4px;">🍪 ${escapeHtml(c.welcomeFreeTitle)}</div>
  <div style="font-size:14px;line-height:1.5;color:${C.ink};">${escapeHtml(c.welcomeFreeBody)}</div>
</td></tr></table>`,
    button(c.welcomeButton, APP_URL),
    p(c.welcomeSignoff),
  ].join('\n');
  const features = c.welcomeFeatures.map((f) => `${f.emoji} ${f.title}\n${f.body}`).join('\n\n');
  return {
    subject: c.welcomeSubject,
    html: layout({ locale: input.locale, subject: c.welcomeSubject, preheader: c.welcomePreheader, title: c.welcomeTitle, body }),
    text: textBlock(
      c.welcomeTitle,
      c.welcomeIntro,
      features,
      `${c.welcomeFreeTitle}\n${c.welcomeFreeBody}`,
      `${c.welcomeButton}: ${APP_URL}`,
      c.welcomeSignoff,
    ),
  };
}

// ── Purchase ──────────────────────────────────────────────────────────────

export type PurchaseStore = 'app_store' | 'play_store' | 'paddle' | 'other';

/** RevenueCat's store names (APP_STORE, MAC_APP_STORE, PLAY_STORE, …) and our 'paddle'. */
export function purchaseStore(raw: string | null | undefined): PurchaseStore {
  const value = (raw ?? '').toLowerCase();
  if (value === 'paddle') return 'paddle';
  if (value.includes('app_store')) return 'app_store';
  if (value.includes('play')) return 'play_store';
  return 'other';
}

const DATE_LOCALES: Record<EmailLocale, string> = { en: 'en-US', es: 'es-ES', he: 'he-IL', ru: 'ru-RU', ar: 'ar' };

export function formatPurchaseDate(date: Date, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

export function renderPurchaseEmail(input: {
  locale: EmailLocale;
  credits: number;
  balance: number | null;
  store: PurchaseStore;
  date: Date;
  reference: string;
}): RenderedEmail {
  const c = COPY[input.locale];
  const rtl = isRtl(input.locale);
  const subject = fill(c.purchaseSubject, { credits: input.credits });
  const intro = fill(c.purchaseIntro, { credits: input.credits });
  const storeName = c.stores[input.store];
  const rows: [string, string, boolean?][] = [
    [c.purchaseCreditsAdded, `+${input.credits}`],
    ...(input.balance === null ? [] : ([[c.purchaseBalance, String(input.balance), true]] as [string, string, boolean][])),
    [c.purchaseVia, storeName],
    [c.purchaseDate, formatPurchaseDate(input.date, input.locale)],
    [c.purchaseReference, input.reference],
  ];
  const start = rtl ? 'right' : 'left';
  const end = rtl ? 'left' : 'right';
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border:1px solid ${C.line};border-radius:18px;" dir="${rtl ? 'rtl' : 'ltr'}">
${rows
  .map(
    ([label, value, strong], i) => `<tr>
<td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ''}font-size:14px;color:${C.muted};text-align:${start};">${escapeHtml(label)}</td>
<td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ''}font-size:${strong ? 18 : 14}px;font-weight:${strong ? 800 : 600};color:${strong ? C.pink : C.ink};text-align:${end};" dir="auto">${escapeHtml(value)}</td>
</tr>`,
  )
  .join('\n')}
</table>`;
  const body = [
    `<div style="text-align:center;font-size:44px;line-height:1;margin:0 0 12px;">🎉</div>`,
    p(intro),
    table,
    p(c.purchaseNever, { small: true }),
    p(fill(c.purchaseReceipt, { store: storeName }), { muted: true, small: true }),
    button(c.purchaseButton, APP_URL),
  ].join('\n');
  return {
    subject,
    html: layout({ locale: input.locale, subject, preheader: c.purchasePreheader, title: c.purchaseTitle, body }),
    text: textBlock(
      c.purchaseTitle,
      intro,
      rows.map(([label, value]) => `${label}: ${value}`).join('\n'),
      c.purchaseNever,
      fill(c.purchaseReceipt, { store: storeName }),
    ),
  };
}

