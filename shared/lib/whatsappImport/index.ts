/**
 * Import recipes from a WhatsApp chat export. Both apps use this module; see types.ts for the shapes.
 *
 * Flow: readChatExport(file) → findRecipeCandidates(chat, …) → the cook ticks items → runImportBatch(ticked, importOne).
 *
 * - parseChat.ts: the export's text → messages (iOS and Android formats, every locale's dates, RTL marks).
 * - chatExport.ts: a picked .txt or .zip → ChatExport (photos are unzipped one at a time, on demand).
 * - candidates.ts, links.ts, recipeSignals.ts: messages → links, written recipes and photos worth importing.
 * - batch.ts: imports the ticked ones, two at a time, and remembers what was imported.
 */
export * from './types';

export { IMPORTED_IDS_KEY, MAX_CHAT_FILE_BYTES } from './constants';
export { parseChatText } from './parseChat';
export { photoToBase64, readChatExport } from './chatExport';
export { findRecipeCandidates } from './candidates';
export { mergeImportedIds, runImportBatch } from './batch';
