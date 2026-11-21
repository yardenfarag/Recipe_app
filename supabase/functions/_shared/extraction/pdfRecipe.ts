/**
 * Import a recipe from a PDF (PIN-72): a saved cookbook page, a magazine scan, a recipe printout.
 *
 * The PDF's own text is read here first, with pdf.js (unpdf). When the pages have text, the text model reads it,
 * which is cheap. A scanned page has no text, so then the PDF itself goes to the photo model, which reads it page by
 * page the way Snap reads a photo. One PDF is one recipe and costs one credit, like a photo.
 */

import { getDocumentProxy } from 'npm:unpdf@2.1.0';

import { generateLlmJson } from '../llm/llmClient.ts';
import type { GeminiUsageSnapshot } from '../llm/pricing.ts';
import { MEASUREMENT_RULES } from '../recipes/ingredientAmounts.ts';
import {
  CALORIE_RULES,
  type GeminiRecipe,
  geminiFoundRecipe,
  INSTRUCTION_RULES,
  isFullGeminiRecipe,
  isGeminiTimeout,
  LANGUAGE_RULE,
  normalizeGeminiRecipe,
  RECIPE_SCHEMA,
  recipeCompleteness,
  TAG_RULES,
  TEXT_MAX_OUTPUT_TOKENS,
  TIME_RULES,
} from './gemini.ts';

/** A phone scan of a few cookbook pages fits; a whole cookbook doesn't. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** One recipe per PDF, so a few pages are enough (a recipe that runs over a page, plus a cover). */
export const MAX_PDF_PAGES = 5;
/** Fewer letters than this in the whole PDF and it is a scan (or a photo saved as a PDF): the photo model reads it. */
export const MIN_TEXT_LAYER_CHARS = 200;
/** A page with fewer letters than this is counted as a scanned page. */
export const MIN_PAGE_TEXT_CHARS = 40;
/**
 * Five dense pages come to about 20,000 characters, so this only cuts something odd. Text past it isn't read at all:
 * reading a page packed with 3.7 million characters takes pdf.js 3.5 s of CPU, and an Edge Function gets 2 s per
 * request. Stopping at this budget took 0.13 s on that page.
 */
const MAX_PDF_TEXT_CHARS = 40_000;

type PdfTextItem = { str?: string; hasEOL?: boolean };

/** The slice of pdf.js that is used here. */
type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    streamTextContent(): ReadableStream<{ items: PdfTextItem[] }>;
  }>;
};

/** A page's text, joined as unpdf's extractText joins it, read only until `budget` characters. */
async function readPageText(doc: PdfDocument, pageNumber: number, budget: number): Promise<string> {
  const reader = (await doc.getPage(pageNumber)).streamTextContent().getReader();
  let text = '';
  while (text.length < budget) {
    const { value, done } = await reader.read();
    if (done) return text;
    for (const item of value.items) {
      if (item.str != null) text += `${item.str}${item.hasEOL ? '\n' : ''}`;
    }
  }
  // Stops pdf.js parsing the rest of the page. It wants an Error as the reason.
  await reader.cancel(new Error('enough text'));
  return text;
}

const TEXT_TIMEOUT_MS = 35_000;
/** Reading up to five page images takes the photo model longer than one photo (45 s). */
const FILE_TIMEOUT_MS = 75_000;
/** Below this much time left, a call isn't started: it would be cut off before it could answer. */
const MIN_TEXT_MS = 8_000;
const MIN_FILE_MS = 20_000;

/** Why a PDF is turned away before any model call. Each has its own message in the apps. */
export type PdfRejectCode = 'pdf_too_large' | 'pdf_too_many_pages' | 'pdf_unreadable';

/** The server's English words for a turned-away PDF. The apps show their own translation for the code. */
export function pdfRejectMessage(code: PdfRejectCode): string {
  switch (code) {
    case 'pdf_too_large':
      return `This PDF is too large. Try one under ${MAX_PDF_BYTES / 1024 / 1024} MB.`;
    case 'pdf_too_many_pages':
      return `This PDF has more than ${MAX_PDF_PAGES} pages. Save just the recipe's pages and try again.`;
    case 'pdf_unreadable':
      return "Couldn't open this PDF. It may be damaged or locked with a password.";
  }
}

export type DecodedPdf = { base64: string; bytes: Uint8Array };

/**
 * The PDF's text, page by page. A scanned page is an empty string. Reading stops once there is enough text for a
 * recipe, so `pages` can be shorter than `pageCount`; pages after it weren't read, and aren't scans.
 */
export type PdfText = { pages: string[]; pageCount: number };

/**
 * `text`: the text layer was enough. `file`: the photo model read the PDF itself. `text+file`: the text gave part of
 * a recipe (or none, with scanned pages left unread), so the photo model read the PDF too.
 */
export type PdfRoute = 'text' | 'file' | 'text+file';

export type PdfExtraction = {
  recipe: GeminiRecipe;
  route: PdfRoute;
  usages: GeminiUsageSnapshot[];
  /** Set when the photo model didn't get to read the PDF because the deadline was too close. */
  fileSkipped?: 'out_of_time';
};

const EMPTY_RECIPE: GeminiRecipe = {
  found_recipe: false,
  source_language: 'en',
  title: '',
  servings: 0,
  ingredients: [],
  instructions: [],
};

/** `%PDF-`, which a PDF starts with (a few junk bytes before it are allowed, as PDF readers do). */
function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= end; i++) {
    if (
      bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Turns the request's `pdf_base64` (plain base64 or a `data:application/pdf;base64,` URL) into bytes. Refuses one
 * over MAX_PDF_BYTES before decoding it, and anything that isn't a PDF.
 */
export function decodePdfBase64(raw: string): { ok: true; pdf: DecodedPdf } | { ok: false; code: PdfRejectCode } {
  let base64 = raw.trim();
  const prefix = base64.match(/^data:application\/pdf;base64,/i);
  if (prefix) base64 = base64.slice(prefix[0].length);
  base64 = base64.replace(/\s/g, '');
  // Four base64 characters carry three bytes.
  if (base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4) return { ok: false, code: 'pdf_too_large' };

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return { ok: false, code: 'pdf_unreadable' };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, code: 'pdf_too_large' };
  if (!hasPdfHeader(bytes)) return { ok: false, code: 'pdf_unreadable' };
  return { ok: true, pdf: { base64, bytes } };
}

/**
 * Opens the PDF and reads its text layer. Refuses one with more than MAX_PDF_PAGES pages, and one pdf.js can't open
 * (damaged, or locked with a password).
 */
export async function readPdfText(
  bytes: Uint8Array,
): Promise<{ ok: true; text: PdfText } | { ok: false; code: PdfRejectCode }> {
  try {
    // pdf.js may take over the buffer it is given; a copy leaves the caller's bytes alone.
    const doc = (await getDocumentProxy(bytes.slice())) as unknown as PdfDocument;
    if (doc.numPages > MAX_PDF_PAGES) return { ok: false, code: 'pdf_too_many_pages' };
    const pages: string[] = [];
    let chars = 0;
    // One page at a time, stopping once there is enough text, even partway through a page.
    for (let n = 1; n <= doc.numPages && chars < MAX_PDF_TEXT_CHARS; n++) {
      const text = (await readPageText(doc, n, MAX_PDF_TEXT_CHARS - chars)).trim();
      pages.push(text);
      chars += text.length;
    }
    return { ok: true, text: { pages, pageCount: doc.numPages } };
  } catch (err) {
    console.warn('[pdf] could not open', {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    return { ok: false, code: 'pdf_unreadable' };
  }
}

function letterCount(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** True when the PDF has enough text of its own to read it as text. */
export function hasTextLayer(text: PdfText): boolean {
  return text.pages.reduce((sum, page) => sum + letterCount(page), 0) >= MIN_TEXT_LAYER_CHARS;
}

/** Pages with (almost) no text: scanned pages, or pages that are one big picture. */
export function scannedPageCount(text: PdfText): number {
  return text.pages.filter((page) => letterCount(page) < MIN_PAGE_TEXT_CHARS).length;
}

/** The text the model reads: every page, marked, so a recipe that runs over a page break stays in order. */
export function pdfTextForModel(text: PdfText): string {
  const joined = text.pages
    .map((page, i) => `--- Page ${i + 1} of ${text.pageCount} ---\n${page || '(no text on this page)'}`)
    .join('\n\n');
  return joined.length > MAX_PDF_TEXT_CHARS ? `${joined.slice(0, MAX_PDF_TEXT_CHARS)}…` : joined;
}

const PDF_TEXT_SYSTEM_PROMPT = `You are a master chef. Analyze the text of a PDF document (a cookbook page, magazine article, recipe printout, or saved recipe) and extract a precise recipe.

Rules:
- Use ONLY the text provided — do not guess or invent ingredients/steps that are not present.
- The text comes from the PDF page by page. Ignore page headers, footers, page numbers, and anything that is not the recipe.
- When the document holds more than one recipe, extract the main one (the one with the most complete ingredients and steps).
- Include ingredients with measurements, and step-by-step instructions when present.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
- Estimate a cost tier from 1-3 dollar signs and an effort level when you can infer them.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the text genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

const PDF_FILE_SYSTEM_PROMPT = `You are a master chef. Analyze the attached PDF (a scanned cookbook page, magazine page, recipe printout, or handwritten card) and extract a precise recipe.

Rules:
- Use ONLY what is in the document — do not guess or invent ingredients/steps that are not present.
- Read every page in order; a recipe may continue from one page to the next. Ignore headers, footers, page numbers, and ads.
- When the document holds more than one recipe, extract the main one (the one with the most complete ingredients and steps).
- Include ingredients with measurements, and step-by-step instructions when present.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
- Estimate a cost tier from 1-3 dollar signs and an effort level when you can infer them.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the document genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

type ModelRead = { recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null };

async function readTextWithModel(text: PdfText, timeoutMs: number): Promise<ModelRead> {
  const { data, usage, durationMs } = await generateLlmJson<GeminiRecipe>({
    systemPrompt: PDF_TEXT_SYSTEM_PROMPT,
    parts: [{ text: `Text of a ${text.pageCount}-page PDF:\n\n${pdfTextForModel(text)}` }],
    responseSchema: RECIPE_SCHEMA,
    timeoutMs,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    kind: 'text',
    context: 'pdfRecipe.ts: readTextWithModel',
  });
  console.log('[pdf] text read ok', { ms: durationMs, usage });
  return { recipe: normalizeGeminiRecipe(data), usage };
}

async function readFileWithModel(pdfBase64: string, timeoutMs: number): Promise<ModelRead> {
  const { data, usage, durationMs } = await generateLlmJson<GeminiRecipe>({
    systemPrompt: PDF_FILE_SYSTEM_PROMPT,
    parts: [{ pdfBase64 }, { text: 'Extract the recipe from this PDF.' }],
    responseSchema: RECIPE_SCHEMA,
    timeoutMs,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    kind: 'photo',
    context: 'pdfRecipe.ts: readFileWithModel',
  });
  console.log('[pdf] file read ok', { ms: durationMs, usage });
  return { recipe: normalizeGeminiRecipe(data), usage };
}

/** The model calls, replaceable in tests. */
export type PdfReaders = {
  readText: (text: PdfText, timeoutMs: number) => Promise<ModelRead>;
  readFile: (pdfBase64: string, timeoutMs: number) => Promise<ModelRead>;
};

const MODEL_READERS: PdfReaders = { readText: readTextWithModel, readFile: readFileWithModel };

/** A step's timeout: its own cap, or less when the deadline is closer. */
function stepTimeout(capMs: number, deadlineAt: number | undefined): number {
  if (deadlineAt === undefined) return capMs;
  return Math.max(0, Math.min(capMs, deadlineAt - Date.now()));
}

/**
 * Reads the recipe out of a PDF, cheapest first:
 *
 * 1. No text layer (a scan): the photo model reads the PDF.
 * 2. Otherwise the text model reads the text. A whole recipe is done.
 * 3. Part of a recipe, or none while some pages are scans: the photo model reads the PDF too, and the more complete
 *    answer wins. No recipe in a PDF that is all text is the answer: the photo model would see the same words.
 *
 * `deadlineAt` (epoch ms) shrinks each call's timeout, and a call that can't fit isn't started.
 */
export async function extractRecipeFromPdf(
  input: { pdf: DecodedPdf; text: PdfText; deadlineAt?: number },
  readers: PdfReaders = MODEL_READERS,
): Promise<PdfExtraction> {
  const { pdf, text, deadlineAt } = input;
  const usages: GeminiUsageSnapshot[] = [];
  const scanned = scannedPageCount(text);
  console.log('[pdf] start', {
    pages: text.pageCount,
    pagesRead: text.pages.length,
    bytes: pdf.bytes.length,
    textLayer: hasTextLayer(text),
    scannedPages: scanned,
  });

  const readFile = async (): Promise<ModelRead | 'out_of_time'> => {
    const timeoutMs = stepTimeout(FILE_TIMEOUT_MS, deadlineAt);
    if (timeoutMs < MIN_FILE_MS) return 'out_of_time';
    const read = await readers.readFile(pdf.base64, timeoutMs);
    if (read.usage) usages.push(read.usage);
    return read;
  };

  if (!hasTextLayer(text)) {
    const read = await readFile();
    if (read === 'out_of_time') return { recipe: EMPTY_RECIPE, route: 'file', usages, fileSkipped: 'out_of_time' };
    return { recipe: read.recipe, route: 'file', usages };
  }

  const textTimeout = stepTimeout(TEXT_TIMEOUT_MS, deadlineAt);
  let fromText: GeminiRecipe = EMPTY_RECIPE;
  let textAnswered = false;
  if (textTimeout >= MIN_TEXT_MS) {
    try {
      const read = await readers.readText(text, textTimeout);
      if (read.usage) usages.push(read.usage);
      fromText = read.recipe;
      textAnswered = true;
    } catch (err) {
      // A slow text model still leaves the photo model, which reads the same pages.
      if (!isGeminiTimeout(err)) throw err;
      console.warn('[pdf] text read timed out');
    }
  }

  if (isFullGeminiRecipe(fromText)) return { recipe: fromText, route: 'text', usages };
  const textFound = geminiFoundRecipe(fromText);
  if (!textFound && scanned === 0 && textAnswered) {
    return { recipe: fromText, route: 'text', usages };
  }

  let read: ModelRead | 'out_of_time';
  try {
    read = await readFile();
  } catch (err) {
    // The text's part of a recipe is still worth keeping (free, as a partial import).
    if (textFound) {
      console.warn('[pdf] file read failed, keeping the text result', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { recipe: fromText, route: 'text', usages };
    }
    throw err;
  }
  if (read === 'out_of_time') {
    return { recipe: fromText, route: 'text', usages, ...(textFound ? {} : { fileSkipped: 'out_of_time' as const }) };
  }
  const fromFile = read.recipe;
  const fileWins = geminiFoundRecipe(fromFile) &&
    (!textFound || recipeCompleteness(fromFile) >= recipeCompleteness(fromText));
  return { recipe: fileWins ? fromFile : fromText, route: 'text+file', usages };
}
