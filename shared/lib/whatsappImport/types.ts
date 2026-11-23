/**
 * Import recipes from a WhatsApp chat export (both apps).
 *
 * The chat is read on the device: the .txt (or the .zip WhatsApp makes when media is attached) never leaves it.
 * Only the recipes the cook ticks are sent to `extract-recipe`, one credit each (ADR 025).
 */

export type CandidateKind = 'link' | 'text' | 'photo';

export type LinkPlatform = 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'pinterest' | 'web';

/** One message from the chat, after parsing. Multi-line messages are joined with "\n". */
export interface ChatMessage {
  index: number;
  /** ISO 8601 date-time when the line's date parsed, otherwise null. */
  sentAt: string | null;
  sender: string;
  text: string;
  /** File names of media attached to this message, as named inside the .zip (e.g. "00000012-PHOTO-2024-05-01-18-22-10.jpg"). */
  attachments: string[];
}

/** The file the cook picked or shared into Pinch. */
export interface ChatExportFile {
  name: string;
  bytes: Uint8Array;
}

export interface ParsedChat {
  /** From the .txt file name when WhatsApp named it ("WhatsApp Chat with Family Recipes.txt"), else undefined. */
  chatName?: string;
  messages: ChatMessage[];
  /** Image files in the .zip, by file name. Bytes are read lazily with `readChatPhoto`. */
  photoNames: string[];
}

/** A read chat export. `readPhoto` unzips one image on demand (null for a .txt export or an unknown name). */
export interface ChatExport extends ParsedChat {
  readPhoto(fileName: string): Uint8Array | null;
}

/** Something in the chat that might be a recipe, shown on the review list. */
export interface RecipeCandidate {
  /** Stable across re-reads of the same chat: used to remember what was already imported. */
  id: string;
  kind: CandidateKind;
  sender: string;
  sentAt: string | null;
  /** kind 'link': the link as sent (trimmed of trailing punctuation). */
  url?: string;
  platform?: LinkPlatform;
  /** kind 'text': the whole message. kind 'photo' / 'link': the caption sent with it, if any. */
  text?: string;
  /** kind 'photo': the file name inside the .zip and its MIME type. */
  photo?: { fileName: string; mime: string };
  /** One short line for the list: the first line of a written recipe, the link's host, or the photo caption. */
  preview: string;
  /** Ticked by default on the review list. False for weak matches (a photo with no caption, a short text). */
  likelyRecipe: boolean;
  /** The link is already in the cook's Library, or this candidate was imported before. Not ticked, costs nothing. */
  alreadySaved: boolean;
}

export type WhatsAppImportErrorCode = 'not_a_chat' | 'too_big' | 'empty';

export class WhatsAppImportError extends Error {
  constructor(public readonly code: WhatsAppImportErrorCode) {
    super(code);
    this.name = 'WhatsAppImportError';
  }
}

/** What happened to one candidate. Each app's `importOne` returns this (extract + save to the Library). */
export type ImportItemResult =
  | { status: 'saved'; recipeId: string }
  | { status: 'already_saved'; recipeId?: string }
  | { status: 'failed'; code?: string }
  /** No credits left. The batch stops starting new items when it sees this. */
  | { status: 'out_of_credits' };

export type ImportItemState = 'waiting' | 'working' | ImportItemResult['status'];

export interface BatchProgress {
  total: number;
  done: number;
  saved: number;
  alreadySaved: number;
  failed: number;
  stoppedForCredits: boolean;
  cancelled: boolean;
  items: Record<string, ImportItemState>;
  /** recipe ids of saved items, by candidate id. */
  recipeIds: Record<string, string>;
}

export interface RunBatchOptions {
  /** Items in flight at once. Default 2. */
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
}
