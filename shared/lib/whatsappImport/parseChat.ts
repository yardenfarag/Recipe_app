import type { ChatMessage } from './types';

/**
 * Parses the text WhatsApp writes when a chat is exported.
 *
 * iOS:     `[1/5/24, 18:22:10] Name: text`   (also `[01.05.24, 18:22:10]`, `[5/1/24, 6:22:10 PM]`)
 * Android: `1/5/24, 18:22 - Name: text`      (also `01/05/2024, 18:22 - Name: text`)
 *
 * Every locale has its own date order and separators, Hebrew and Arabic exports sprinkle direction marks
 * through the line, and Arabic ones may use Arabic-Indic digits. A line without a date continues the message
 * above it. A dated line without "Name:" is a system line ("X added Y") and is dropped.
 */

/** Direction marks, embeddings and isolates (Hebrew/Arabic exports put them anywhere), plus BOMs. */
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;
/** Narrow and regular no-break spaces (iOS puts U+202F before AM/PM). Same length, so indexes line up. */
const ODD_SPACES = /[\u00A0\u202F\u2007\u2009]/g;

const DATE = '(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})\\.?';
const TIME = '(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?';
/** AM/PM in its common spellings (AM, a.m., a. m.) and Arabic ص / م. */
const AMPM = '(?:\\s*([AaPp])\\.?\\s?[Mm]\\.?|\\s*(\u0635|\u0645))?';
const DATE_TIME_SEPARATOR = '[,\u060C]?\\s*';

const IOS_HEADER = new RegExp(`^\\[${DATE}${DATE_TIME_SEPARATOR}${TIME}${AMPM}\\]\\s?`);
const ANDROID_HEADER = new RegExp(`^${DATE}${DATE_TIME_SEPARATOR}${TIME}${AMPM}\\s*[-\u2013\u2014]\\s`);

/** iOS: `<attached: 00000012-PHOTO-2024-05-01-18-22-10.jpg>`, in any language (`<adjunto: …>`). */
const ATTACHED_TAG = /<([^<>:\n]{1,40}):\s*([^<>\n]+?\.[A-Za-z0-9]{2,5})\s*>/g;

const MEDIA_EXTENSIONS = [
  'jpe?g|png|webp|heic|heif|gif',
  'mp4|mov|3gp|mkv|webm|avi',
  'opus|ogg|oga|m4a|mp3|aac|amr|wav',
  'pdf|docx?|xlsx?|pptx?|txt|vcf|zip|rtf|csv',
].join('|');
/** Android: `IMG-20240501-WA0003.jpg (file attached)`, in any language (`(קובץ מצורף)`, `(archivo adjunto)`). */
const ANDROID_ATTACHMENT_LINE = new RegExp(
  `^\\s*([^\\s<>:"/\\\\|?*][^<>:"/\\\\|?*\\n]{0,150}?\\.(?:${MEDIA_EXTENSIONS}))\\s+\\([^()\\n]{2,40}\\)\\s*$`,
  'i',
);

/** A whole message that is only a placeholder: `<Media omitted>`, `<Medien ausgeschlossen>`, `<המדיה לא נכללה>`. */
const PLACEHOLDER_ONLY = /^\s*<[^<>:\n]{2,60}>\s*$/;
/** A trailing marker such as `<This message was edited>`. */
const TRAILING_PLACEHOLDER = /\s*<[^<>:\n]{2,60}>\s*$/;
/** Older iOS exports: `image omitted`, `video omitted`… */
const IOS_OMITTED = /^\s*(?:image|video|audio|sticker|GIF|document|Contact card) omitted\s*$/i;

const URL_HINT = /https?:\/\/|www\./i;
const QUOTES = /["\u201C\u201D\u00AB\u00BB\u201E]/;

interface DateParts {
  a: string;
  b: string;
  c: string;
  hour: number;
  minute: number;
  second: number;
  /** 'am' | 'pm' when the line had a 12-hour clock. */
  half: 'am' | 'pm' | null;
}

interface RawMessage {
  date: DateParts;
  sender: string;
  lines: string[];
  /** iOS writes WhatsApp's own notes ("\u200Eimage omitted", "\u200EX added Y") with a direction mark first. */
  markedText: boolean;
}

export interface ParsedChatText {
  messages: ChatMessage[];
  /** Lines that started with a WhatsApp date, system lines included. Zero means the text isn't a chat. */
  datedLines: number;
}

/** Maps Arabic-Indic and Persian digits to ASCII, one character for one, so indexes stay the same. */
function asciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function matchHeader(line: string): { match: RegExpMatchArray; ios: boolean } | null {
  const first = line.charCodeAt(0);
  // Cheap check before the regexes: a header starts with "[" or a digit.
  if (first !== 0x5b && !(first >= 0x30 && first <= 0x39)) return null;
  const ios = IOS_HEADER.exec(line);
  if (ios) return { match: ios, ios: true };
  const android = ANDROID_HEADER.exec(line);
  return android ? { match: android, ios: false } : null;
}

function dateParts(match: RegExpMatchArray): DateParts {
  const halfLetter = (match[7] ?? '').toLowerCase();
  const arabicHalf = match[8];
  let half: DateParts['half'] = null;
  if (halfLetter === 'a' || arabicHalf === '\u0635') half = 'am';
  else if (halfLetter === 'p' || arabicHalf === '\u0645') half = 'pm';
  return {
    a: match[1],
    b: match[2],
    c: match[3],
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
    half,
  };
}

/** Splits `Name: text`. Null for system lines, which have no sender. */
function splitSender(rest: string): { sender: string; text: string } | null {
  const colon = rest.search(/:(?:\s|$)/);
  if (colon <= 0) return null;
  const sender = rest
    .slice(0, colon)
    .replace(/^~\s*/, '')
    .trim();
  if (!sender || sender.length > 80 || QUOTES.test(sender)) return null;
  return { sender, text: rest.slice(colon + 1).replace(/^\s/, '') };
}

/** True when the text right after `Name: ` in the raw (unstripped) iOS line starts with a direction mark. */
function startsWithMark(rawLine: string): boolean {
  const close = rawLine.indexOf(']');
  if (close < 0) return false;
  return /^[^:]*:\s?[\u200E\u200F]/.test(rawLine.slice(close + 1));
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Local wall-clock time as ISO 8601 without an offset (the chat doesn't say which time zone), or null. */
function toIso(parts: DateParts, dayFirst: boolean): string | null {
  let year: number;
  let month: number;
  let day: number;
  if (parts.a.length >= 3) {
    year = Number(parts.a);
    month = Number(parts.b);
    day = Number(parts.c);
  } else {
    year = Number(parts.c);
    if (parts.c.length <= 2) year += 2000;
    month = Number(dayFirst ? parts.b : parts.a);
    day = Number(dayFirst ? parts.a : parts.b);
  }
  let hour = parts.hour;
  if (parts.half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (parts.half === 'pm' ? 12 : 0);
  }
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  if (hour > 23 || parts.minute > 59 || parts.second > 59) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * Day/month order is the same for the whole file: any first number above 12 means day first, any second
 * number above 12 means month first, and day first wins when nothing decides it.
 */
function inferDayFirst(dates: DateParts[]): boolean {
  let monthFirstSeen = false;
  for (const date of dates) {
    if (date.a.length >= 3) continue;
    if (Number(date.a) > 12) return true;
    if (Number(date.b) > 12) monthFirstSeen = true;
  }
  return !monthFirstSeen;
}

function finishMessage(raw: RawMessage, index: number, dayFirst: boolean): ChatMessage | null {
  const attachments: string[] = [];
  const kept: string[] = [];
  for (const line of raw.lines) {
    const android = ANDROID_ATTACHMENT_LINE.exec(line);
    if (android) {
      attachments.push(android[1].trim());
      continue;
    }
    kept.push(
      line.replace(ATTACHED_TAG, (_tag, _label: string, name: string) => {
        attachments.push(name.trim());
        return '';
      }),
    );
  }

  let text = kept.join('\n').trim();
  if (PLACEHOLDER_ONLY.test(text) || IOS_OMITTED.test(text)) text = '';
  text = text.replace(TRAILING_PLACEHOLDER, '').trim();

  // WhatsApp's own notes on iOS start with a left-to-right mark: "This message was deleted", "Missed voice call",
  // "X added Y". A cook's message almost never does; when one does, it is kept if it has a link or more lines.
  if (raw.markedText && attachments.length === 0 && !text.includes('\n') && !URL_HINT.test(text)) {
    return null;
  }
  if (!text && attachments.length === 0) return null;

  return { index, sentAt: toIso(raw.date, dayFirst), sender: raw.sender, text, attachments };
}

/** Parses a chat export and also counts its dated lines, so callers can tell "not a chat" from "no messages". */
export function parseChat(input: string): ParsedChatText {
  const raws: RawMessage[] = [];
  const dates: DateParts[] = [];
  let current: RawMessage | null = null;

  for (const rawLine of input.split(/\r\n|\r|\n/)) {
    const clean = rawLine.replace(BIDI_MARKS, '');
    const header = matchHeader(asciiDigits(clean.replace(ODD_SPACES, ' ')));

    if (!header) {
      // A line without a date continues the message above it (lines after a system line are dropped).
      current?.lines.push(clean);
      continue;
    }

    const date = dateParts(header.match);
    dates.push(date);
    const split = splitSender(clean.slice(header.match[0].length).replace(ODD_SPACES, ' '));
    if (!split) {
      current = null;
      continue;
    }
    current = {
      date,
      sender: split.sender,
      lines: [split.text],
      markedText: header.ios && startsWithMark(rawLine),
    };
    raws.push(current);
  }

  const dayFirst = inferDayFirst(dates);
  const messages: ChatMessage[] = [];
  for (const raw of raws) {
    const message = finishMessage(raw, messages.length, dayFirst);
    if (message) messages.push(message);
  }
  return { messages, datedLines: dates.length };
}

/** Parses the text of a WhatsApp export (iOS and Android formats, any locale's date format). */
export function parseChatText(text: string): ChatMessage[] {
  return parseChat(text).messages;
}
