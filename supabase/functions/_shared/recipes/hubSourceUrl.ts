/**
 * Which web links may become a public Hub card, and the one address each is stored under.
 *
 * A Hub card shows the recipe to everyone and links to its source. That is only right for a page
 * anyone could open. A link that carries a private token (a shared Google Doc, a "view with this
 * key" address) must never be published, and must never be matched against another card either:
 * dropping the token and comparing the rest would hand one person's recipe to the next visitor
 * with a similar link (PIN-153).
 *
 * So for a web page: tracking parameters are dropped, a short list of parameters that name the
 * page are kept, and any other parameter means "not for the Hub". The recipe is still extracted
 * and saved for the user; it just isn't shared.
 */

/**
 * Added by ads, search results, newsletters and share buttons; they never change which page it
 * is. Dropping them matters twice: the same page shared two ways is one card, and a link from a
 * Google result (`srsltid`) or an Instagram bio (`igsh`) isn't mistaken for one with a key.
 */
const TRACKING_PARAM =
  /^(utm_|mc_|pk_|hsa_|_hs|gad_|ref_|fbclid$|gclid$|gbraid$|wbraid$|dclid$|msclkid$|yclid$|twclid$|ttclid$|igshid$|igsh$|srsltid$|epik$|_ga$|_gl$|ref$)/i;

/** Parameters that pick the page on sites without pretty addresses (`?p=123`). */
const PAGE_PARAMS = new Set([
  'p',
  'page_id',
  'id',
  'recipe',
  'recipe_id',
  'recipeid',
  'post',
  'post_id',
  'article',
  'article_id',
  'item',
  'pid',
  'lang',
  'hl',
]);

/**
 * Document, file-sharing, chat and mail sites: what's there belongs to whoever shared the link,
 * even when the link itself opens for anyone. Matches the host and its subdomains.
 */
const PRIVATE_HOSTS = [
  'docs.google.com',
  'drive.google.com',
  'mail.google.com',
  'gemini.google.com',
  'photos.google.com',
  'photos.app.goo.gl',
  'dropbox.com',
  'dropboxusercontent.com',
  'onedrive.live.com',
  '1drv.ms',
  'sharepoint.com',
  'office.com',
  'live.com',
  'icloud.com',
  'box.com',
  'notion.so',
  'notion.site',
  'evernote.com',
  'coda.io',
  'quip.com',
  'airtable.com',
  'docsend.com',
  'wetransfer.com',
  'we.tl',
  'mega.nz',
  'pcloud.com',
  'slack.com',
  'slack-files.com',
  'discord.com',
  'discordapp.com',
  'web.whatsapp.com',
  'web.telegram.org',
  'trello.com',
  'pastebin.com',
  'canva.com',
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'copilot.microsoft.com',
  'perplexity.ai',
];

function isPrivateHost(host: string): boolean {
  return PRIVATE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/**
 * A path part that reads like a key, not a name: 20+ characters with upper case, lower case and
 * digits mixed ("1BxiMVs0XRA5nFMdKvBdBZjgmUU"), or 32+ hex digits. Recipe slugs are lower-case
 * words with hyphens and don't match.
 */
function looksLikeToken(segment: string): boolean {
  if (/^[0-9a-f]{32,}$/i.test(segment.replaceAll('-', ''))) return true;
  if (segment.length < 20 || !/^[A-Za-z0-9_-]+$/.test(segment)) return false;
  return /[A-Z]/.test(segment) && /[a-z]/.test(segment) && /\d/.test(segment);
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * The address a web recipe's Hub card is stored under, or null when the link isn't a public page
 * we should publish or compare. Null on anything unexpected, so a link we can't judge stays
 * private.
 */
export function hubWebUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password || u.port) return null;

    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.') || isIpAddress(host) || isPrivateHost(host)) return null;

    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    for (const key of u.searchParams.keys()) {
      if (!PAGE_PARAMS.has(key.toLowerCase())) return null;
    }

    let path = u.pathname;
    if (path.split('/').some((segment) => looksLikeToken(safeDecode(segment)))) return null;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    u.hostname = host;
    return u.toString();
  } catch {
    return null;
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
