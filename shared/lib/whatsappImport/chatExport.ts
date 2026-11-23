import { encode } from 'base64-arraybuffer';
import { strFromU8, unzipSync } from 'fflate';

import { MAX_CHAT_FILE_BYTES, photoMime } from './constants';
import { parseChat, type ParsedChatText } from './parseChat';
import { WhatsAppImportError, type ChatExport, type ChatExportFile, type ParsedChat } from './types';

function isZip(bytes: Uint8Array): boolean {
  // PK\x03\x04 (a local file header), or PK\x05\x06 (an empty archive's end record).
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** macOS adds `__MACOSX/` and `._name` copies when someone re-zips an export. */
function isJunkEntry(name: string): boolean {
  return name.endsWith('/') || name.startsWith('__MACOSX/') || baseName(name).startsWith('._');
}

/** "WhatsApp Chat with Family Recipes.txt", "WhatsApp Chat - Family.zip" and a few translations → the chat's name. */
const CHAT_NAME_PATTERNS: RegExp[] = [
  /^WhatsApp Chat (?:with|-|–)\s*(.+)$/i,
  /^Chat de WhatsApp (?:con|-)\s*(.+)$/i,
  /^Чат WhatsApp (?:с|-)\s*(.+)$/i,
  /^צ['׳]אט WhatsApp (?:עם|-)\s*(.+)$/,
  /^(?:دردشة|محادثة) (?:WhatsApp|واتساب) (?:مع|-)\s*(.+)$/,
];

export function chatNameFromFileName(fileName: string): string | undefined {
  const stem = baseName(fileName)
    .replace(/\.(?:txt|zip)$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
  for (const pattern of CHAT_NAME_PATTERNS) {
    const name = stem.match(pattern)?.[1]?.trim();
    if (name) return name;
  }
  return undefined;
}

/** The chat text inside a .zip: `_chat.txt` (iOS), `WhatsApp Chat with X.txt` (Android), else any .txt. */
function chatTextEntries(names: string[]): string[] {
  const texts = names.filter((name) => /\.txt$/i.test(name));
  const rank = (name: string) => {
    const base = baseName(name).toLowerCase();
    if (base === '_chat.txt') return 0;
    if (base.includes('whatsapp') || chatNameFromFileName(name)) return 1;
    return 2;
  };
  return [...texts].sort((x, y) => rank(x) - rank(y));
}

function finish(parsed: ParsedChatText): void {
  if (parsed.datedLines === 0) throw new WhatsAppImportError('not_a_chat');
  if (parsed.messages.length === 0) throw new WhatsAppImportError('empty');
}

function readZip(file: ChatExportFile): ChatExport {
  const { bytes } = file;
  const names: string[] = [];
  try {
    // Lists the entries without decompressing any of them.
    unzipSync(bytes, {
      filter: (entry) => {
        if (!isJunkEntry(entry.name)) names.push(entry.name);
        return false;
      },
    });
  } catch {
    throw new WhatsAppImportError('not_a_chat');
  }

  let parsed: ParsedChatText | null = null;
  let chatEntry: string | null = null;
  for (const name of chatTextEntries(names)) {
    let text: string;
    try {
      const data = unzipSync(bytes, { filter: (entry) => entry.name === name })[name];
      if (!data) continue;
      text = strFromU8(data);
    } catch {
      continue;
    }
    const candidate = parseChat(text);
    if (candidate.datedLines > 0) {
      parsed = candidate;
      chatEntry = name;
      break;
    }
  }
  if (!parsed || !chatEntry) throw new WhatsAppImportError('not_a_chat');
  finish(parsed);

  const photoNames = names.filter((name) => photoMime(name) !== null);
  // The parsed directory, kept so readPhoto can find an entry by its full path or its bare file name.
  const entryByName = new Map<string, string>();
  for (const name of photoNames) {
    entryByName.set(name, name);
    const base = baseName(name);
    if (!entryByName.has(base)) entryByName.set(base, name);
  }

  const chat: ParsedChat = {
    chatName: chatNameFromFileName(chatEntry) ?? chatNameFromFileName(file.name),
    messages: parsed.messages,
    photoNames,
  };
  return {
    ...chat,
    readPhoto(fileName: string): Uint8Array | null {
      const entry = entryByName.get(fileName) ?? entryByName.get(baseName(fileName));
      if (!entry) return null;
      try {
        return unzipSync(bytes, { filter: (info) => info.name === entry })[entry] ?? null;
      } catch {
        return null;
      }
    },
  };
}

/** Reads a .txt or .zip export. Throws WhatsAppImportError: 'too_big', 'not_a_chat' (no chat lines), 'empty'. */
export function readChatExport(file: ChatExportFile): ChatExport {
  if (file.bytes.length > MAX_CHAT_FILE_BYTES) throw new WhatsAppImportError('too_big');
  if (isZip(file.bytes)) return readZip(file);

  let text: string;
  try {
    text = strFromU8(file.bytes);
  } catch {
    throw new WhatsAppImportError('not_a_chat');
  }
  const parsed = parseChat(text);
  finish(parsed);
  return {
    chatName: chatNameFromFileName(file.name),
    messages: parsed.messages,
    photoNames: [],
    readPhoto: () => null,
  };
}

/** Base64 of a photo's bytes, for extractRecipeFromImage. */
export function photoToBase64(bytes: Uint8Array): string {
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const buffer = whole ? bytes.buffer : bytes.slice().buffer;
  return encode(buffer as ArrayBuffer);
}
