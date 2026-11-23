import { photoMime } from './constants';
import {
  findLinks,
  isSkippedLink,
  isSocialPost,
  linkPlatform,
  linkPreview,
  normalizeLink,
  parseLink,
} from './links';
import { looksFoodRelated, recipeShape, urlLooksLikeRecipe, type RecipeShape } from './recipeSignals';
import type { ChatMessage, LinkPlatform, ParsedChat, RecipeCandidate } from './types';

const PREVIEW_MAX = 80;
/** A caption sent as its own message right after the photo, by the same person. */
const CAPTION_WINDOW_MS = 2 * 60 * 1000;
/** A link or written recipe this close to a photo, from the same person, makes the photo likely a recipe. */
const NEIGHBOUR_WINDOW_MS = 5 * 60 * 1000;

/** cyrb53: a fast, well-spread 53-bit string hash. Ids only need to be stable, not secret. */
function hash(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function candidateId(kind: RecipeCandidate['kind'], key: string): string {
  return `${kind}-${hash(`${kind}:${key}`)}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** One line, at most 80 characters (counted in code points so an emoji is never cut in half). */
export function previewLine(text: string | undefined): string {
  if (!text) return '';
  const line =
    text
      .split('\n')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? '';
  const chars = Array.from(line);
  return chars.length <= PREVIEW_MAX ? line : `${chars.slice(0, PREVIEW_MAX - 1).join('').trimEnd()}\u2026`;
}

function time(message: ChatMessage): number | null {
  if (!message.sentAt) return null;
  const ms = Date.parse(message.sentAt);
  return Number.isNaN(ms) ? null : ms;
}

/** True when `b` was sent within `windowMs` of `a`. Without dates, only the very next message counts. */
function closeInTime(a: ChatMessage, b: ChatMessage, windowMs: number, adjacent: boolean): boolean {
  const ta = time(a);
  const tb = time(b);
  if (ta === null || tb === null) return adjacent;
  return Math.abs(tb - ta) <= windowMs;
}

interface UsableLink {
  url: URL;
  link: string;
  platform: LinkPlatform;
  key: string;
}

interface MessageInfo {
  links: UsableLink[];
  /** The message without its links, for a link's `text`. */
  textWithoutLinks: string;
  /** Image attachments that are in the .zip, by their name inside it. */
  photos: string[];
  shape: RecipeShape | undefined;
}

function usableLinks(text: string): UsableLink[] {
  const out: UsableLink[] = [];
  for (const link of findLinks(text)) {
    const url = parseLink(link);
    if (!url || isSkippedLink(url)) continue;
    const platform = linkPlatform(url);
    if (!platform) continue;
    out.push({ url, link, platform, key: normalizeLink(url) });
  }
  return out;
}

/** The message without any of its links, and without the brackets and punctuation they leave behind. */
function withoutLinks(text: string): string {
  let rest = text;
  for (const link of findLinks(text)) rest = rest.split(link).join(' ');
  return rest
    .split('\n')
    .map((line) =>
      line
        .replace(/\(\s*\)|\[\s*\]|<\s*>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ([)\].,!?:;])/g, '$1')
        .trim(),
    )
    // Drop lines left with only ASCII punctuation.
    .filter((line) => /[^\s!-/:-@[-`{-~]/.test(line))
    .join('\n')
    .trim();
}

/**
 * Finds links, written recipes and photos that may be recipes, newest first.
 * `savedSourceUrls`: source URLs of recipes already in the Library. `importedIds`: ids from IMPORTED_IDS_KEY.
 */
export function findRecipeCandidates(
  chat: ParsedChat,
  opts: { savedSourceUrls?: Iterable<string>; importedIds?: Iterable<string> } = {},
): RecipeCandidate[] {
  const saved = new Set<string>();
  for (const url of opts.savedSourceUrls ?? []) if (url) saved.add(normalizeLink(url));
  const imported = new Set(opts.importedIds ?? []);

  const zipPhotos = new Map<string, string>();
  for (const name of chat.photoNames) {
    if (!photoMime(name)) continue;
    zipPhotos.set(name, name);
    if (!zipPhotos.has(baseName(name))) zipPhotos.set(baseName(name), name);
  }

  const messages = chat.messages;
  const infos: (MessageInfo | undefined)[] = new Array(messages.length);
  const info = (i: number): MessageInfo => {
    const cached = infos[i];
    if (cached) return cached;
    const message = messages[i];
    const links = message.text ? usableLinks(message.text) : [];
    const photos: string[] = [];
    for (const attachment of message.attachments) {
      const entry = zipPhotos.get(attachment) ?? zipPhotos.get(baseName(attachment));
      if (entry && !photos.includes(entry)) photos.push(entry);
    }
    const created: MessageInfo = {
      links,
      textWithoutLinks: message.text ? withoutLinks(message.text) : '',
      photos,
      shape: undefined,
    };
    infos[i] = created;
    return created;
  };
  const shape = (i: number): RecipeShape => {
    const current = info(i);
    if (current.shape === undefined) current.shape = current.links.length ? null : recipeShape(messages[i].text);
    return current.shape;
  };

  /** The photo's own text, else the next text message from the same sender within two minutes (albums skipped). */
  const captionFor = (i: number): string => {
    const own = info(i).textWithoutLinks.trim();
    if (own) return own;
    const photoMessage = messages[i];
    for (let j = i + 1; j < messages.length && j <= i + 10; j++) {
      const next = messages[j];
      if (next.sender !== photoMessage.sender) break;
      if (!closeInTime(photoMessage, next, CAPTION_WINDOW_MS, j === i + 1)) break;
      const nextInfo = info(j);
      const text = nextInfo.textWithoutLinks.trim();
      if (text) return nextInfo.photos.length ? '' : text;
      if (!next.attachments.length) break;
    }
    return '';
  };

  /** A link or a written recipe from the same sender sits right next to message i. */
  const recipeNearby = (i: number): boolean => {
    const message = messages[i];
    for (let j = Math.max(0, i - 2); j <= Math.min(messages.length - 1, i + 2); j++) {
      if (j === i) continue;
      const other = messages[j];
      if (other.sender !== message.sender) continue;
      if (!closeInTime(message, other, NEIGHBOUR_WINDOW_MS, Math.abs(j - i) === 1)) continue;
      if (info(j).links.length || shape(j)) return true;
    }
    return false;
  };

  const byId = new Map<string, RecipeCandidate>();
  const ordered: RecipeCandidate[] = [];
  const add = (candidate: RecipeCandidate) => {
    const existing = byId.get(candidate.id);
    if (existing) {
      // Same link or text sent again: the newest stays, and keeps the first caption it can get.
      if (!existing.text && candidate.text) existing.text = candidate.text;
      return;
    }
    byId.set(candidate.id, candidate);
    ordered.push(candidate);
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const current = info(i);
    const base = { sender: message.sender, sentAt: message.sentAt };

    for (const { url, link, platform, key } of current.links) {
      const id = candidateId('link', key);
      const text = current.textWithoutLinks || undefined;
      const likelyRecipe =
        platform === 'web'
          ? urlLooksLikeRecipe(url.hostname.toLowerCase(), url.pathname) || (!!text && looksFoodRelated(text))
          : isSocialPost(url, platform);
      add({
        id,
        kind: 'link',
        ...base,
        url: link,
        platform,
        ...(text ? { text } : {}),
        preview: previewLine(linkPreview(url, platform)),
        likelyRecipe,
        alreadySaved: saved.has(key) || imported.has(id),
      });
    }

    if (!current.links.length && !current.photos.length && message.text) {
      const recipe = shape(i);
      if (recipe) {
        const id = candidateId('text', normalizeText(message.text));
        add({
          id,
          kind: 'text',
          ...base,
          text: message.text,
          preview: previewLine(message.text),
          likelyRecipe: recipe === 'strong',
          alreadySaved: imported.has(id),
        });
      }
    }

    if (current.photos.length) {
      const caption = captionFor(i);
      const captionIsRecipe = caption ? looksFoodRelated(caption) || recipeShape(caption) !== null : false;
      const likelyRecipe = captionIsRecipe || current.links.length > 0 || recipeNearby(i);
      for (const fileName of current.photos) {
        const id = candidateId('photo', baseName(fileName));
        add({
          id,
          kind: 'photo',
          ...base,
          ...(caption ? { text: caption } : {}),
          photo: { fileName, mime: photoMime(fileName) ?? 'image/jpeg' },
          preview: previewLine(caption),
          likelyRecipe,
          alreadySaved: imported.has(id),
        });
      }
    }
  }

  return ordered;
}
