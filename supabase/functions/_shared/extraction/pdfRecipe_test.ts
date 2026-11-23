// npx deno test -A --no-lock --config supabase/functions/deno.json supabase/functions/_shared/extraction/pdfRecipe_test.ts
//
// Import a recipe from a PDF (PIN-72): the text layer is read when there is one, and the photo model reads the PDF
// itself when pages are scans.

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { PDFDocument, StandardFonts } from 'npm:pdf-lib@1.17.1';

import { FetchError } from '../core/errors.ts';
import type { LlmRecipe } from './recipeExtraction.ts';
import { partsToOpenRouterContent } from '../llm/llmClient.ts';
import {
  decodePdfBase64,
  type DecodedPdf,
  extractRecipeFromPdf,
  hasTextLayer,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  type PdfReaders,
  type PdfText,
  pdfTextForModel,
  readPdfText,
  scannedPageCount,
} from './pdfRecipe.ts';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * A PDF with one page per entry: lines of text, or `scan` for a page that is only a picture. Long pages wrap back to
 * the top (the lines overlap), because pdf.js leaves out text drawn off the page.
 */
async function makePdf(pages: Array<string[] | 'scan'>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0)));
  for (const lines of pages) {
    const page = doc.addPage();
    if (lines === 'scan') {
      page.drawImage(png, { x: 0, y: 0, width: 600, height: 800 });
    } else {
      lines.forEach((line, i) => page.drawText(line, { x: 50, y: 760 - (i % 40) * 18, size: 12, font }));
    }
  }
  return await doc.save();
}

const RECIPE_LINES = [
  'Lemon drizzle cake',
  'Ingredients',
  '225 g unsalted butter, softened',
  '225 g caster sugar',
  '4 eggs',
  '275 g self-raising flour',
  '2 lemons, zested and juiced',
  'Method',
  '1. Heat the oven to 180 C and line a loaf tin.',
  '2. Beat the butter and sugar until pale, then beat in the eggs one at a time.',
  '3. Fold in the flour and lemon zest, then bake for 45 minutes.',
];

function recipe(overrides: Partial<LlmRecipe> = {}): LlmRecipe {
  return {
    found_recipe: true,
    source_language: 'en',
    title: 'Lemon drizzle cake',
    servings: 8,
    ingredients: [{ name: 'flour', quantity: 275, unit: 'g' }],
    instructions: [{ step: 1, text: 'Bake.' }],
    ...overrides,
  };
}

const NONE = recipe({ found_recipe: false, title: '', ingredients: [], instructions: [] });
const PARTIAL = recipe({ instructions: [] });

/** Readers that answer as told and record what was called. */
function readers(answers: { text?: LlmRecipe | Error; file?: LlmRecipe | Error }) {
  const calls: string[] = [];
  const answer = async (kind: 'text' | 'file') => {
    calls.push(kind);
    const value = answers[kind];
    if (value instanceof Error) throw value;
    if (!value) throw new Error(`unexpected ${kind} read`);
    return { recipe: value, usage: null };
  };
  const stub: PdfReaders = { readText: () => answer('text'), readFile: () => answer('file') };
  return { stub, calls };
}

async function decoded(pages: Array<string[] | 'scan'>): Promise<{ pdf: DecodedPdf; text: PdfText }> {
  const result = decodePdfBase64(encodeBase64(await makePdf(pages)));
  if (!result.ok) throw new Error(result.code);
  const read = await readPdfText(result.pdf.bytes);
  if (!read.ok) throw new Error(read.code);
  return { pdf: result.pdf, text: read.text };
}

Deno.test('decodePdfBase64 takes plain base64 and a data URL', async () => {
  const base64 = encodeBase64(await makePdf([['Soup']]));
  const plain = decodePdfBase64(base64);
  const url = decodePdfBase64(`data:application/pdf;base64,${base64}`);
  assert(plain.ok && url.ok);
  assertEquals(plain.pdf.base64, base64);
  assertEquals(url.pdf.base64, base64);
});

Deno.test('decodePdfBase64 turns away what is not a PDF', () => {
  assertEquals(decodePdfBase64(encodeBase64(new TextEncoder().encode('<html>hello</html>'))), {
    ok: false,
    code: 'pdf_unreadable',
  });
  assertEquals(decodePdfBase64('not base64 at all!'), { ok: false, code: 'pdf_unreadable' });
});

Deno.test('decodePdfBase64 turns away a PDF over the size limit before decoding it', () => {
  const tooBig = 'A'.repeat(Math.ceil(MAX_PDF_BYTES / 3) * 4 + 4);
  assertEquals(decodePdfBase64(tooBig), { ok: false, code: 'pdf_too_large' });
});

Deno.test('readPdfText reads each page, with a scanned page as empty text', async () => {
  const { text } = await decoded([RECIPE_LINES.slice(0, 7), 'scan', RECIPE_LINES.slice(7)]);
  assertEquals(text.pages.length, 3);
  assertEquals(text.pageCount, 3);
  assert(text.pages[0].includes('Lemon drizzle cake'));
  assertEquals(text.pages[1], '');
  assert(text.pages[2].includes('Heat the oven'));
  assert(hasTextLayer(text));
  assertEquals(scannedPageCount(text), 1);
});

Deno.test('readPdfText stops once it has enough text, and the pages it skips are not scans', async () => {
  const fullPage = Array.from({ length: 700 }, (_, i) => `Line ${i}: 200 g flour, 2 eggs, a pinch of salt`);
  const { text } = await decoded([fullPage, fullPage, fullPage]);
  assertEquals(text.pageCount, 3);
  assertEquals(text.pages.length, 2);
  assertEquals(scannedPageCount(text), 0);
  assert(pdfTextForModel(text).includes('--- Page 2 of 3 ---'));
});

Deno.test('readPdfText stops partway through a page packed with text', async () => {
  const packed = Array.from({ length: 3_000 }, (_, i) => `Line ${i}: 200 g flour, 2 eggs, a pinch of salt`);
  const { text } = await decoded([packed]);
  assertEquals(text.pages.length, 1);
  // About 138,000 characters on the page; reading stops soon after 40,000.
  assert(text.pages[0].length >= 40_000, String(text.pages[0].length));
  assert(text.pages[0].length < 80_000, String(text.pages[0].length));
});

Deno.test('readPdfText turns away a PDF with too many pages', async () => {
  const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => [`Page ${i + 1}`]);
  const result = decodePdfBase64(encodeBase64(await makePdf(pages)));
  assert(result.ok);
  assertEquals(await readPdfText(result.pdf.bytes), { ok: false, code: 'pdf_too_many_pages' });
});

Deno.test('readPdfText turns away a damaged PDF', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\nthis is not really a pdf');
  assertEquals(await readPdfText(bytes), { ok: false, code: 'pdf_unreadable' });
});

Deno.test('a scanned PDF has no text layer', async () => {
  const { text } = await decoded(['scan', 'scan']);
  assertEquals(hasTextLayer(text), false);
  assertEquals(scannedPageCount(text), 2);
});

Deno.test('pdfTextForModel marks each page', () => {
  const text = pdfTextForModel({ pages: ['Ingredients: flour', ''], pageCount: 2 });
  assert(text.includes('--- Page 1 of 2 ---\nIngredients: flour'));
  assert(text.includes('--- Page 2 of 2 ---\n(no text on this page)'));
});

Deno.test('a PDF with text is read as text, and a whole recipe ends there', async () => {
  const { stub, calls } = readers({ text: recipe() });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES]), stub);
  assertEquals(calls, ['text']);
  assertEquals(result.route, 'text');
  assertEquals(result.recipe.title, 'Lemon drizzle cake');
});

Deno.test('a scanned PDF goes straight to the photo model', async () => {
  const { stub, calls } = readers({ file: recipe() });
  const result = await extractRecipeFromPdf(await decoded(['scan']), stub);
  assertEquals(calls, ['file']);
  assertEquals(result.route, 'file');
});

Deno.test('part of a recipe in the text: the photo model reads the PDF, and the fuller answer wins', async () => {
  const { stub, calls } = readers({ text: PARTIAL, file: recipe() });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES]), stub);
  assertEquals(calls, ['text', 'file']);
  assertEquals(result.route, 'text+file');
  assertEquals(result.recipe.instructions.length, 1);
});

Deno.test('the text part is kept when the photo model finds less', async () => {
  const { stub } = readers({ text: PARTIAL, file: NONE });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES]), stub);
  assertEquals(result.recipe, PARTIAL);
});

Deno.test('the text part is kept when the photo model fails', async () => {
  const { stub } = readers({ text: PARTIAL, file: new Error('provider down') });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES]), stub);
  assertEquals(result.route, 'text');
  assertEquals(result.recipe, PARTIAL);
});

Deno.test('no recipe in an all-text PDF is the answer: the photo model is not asked', async () => {
  const { stub, calls } = readers({ text: NONE });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES.map(() => 'Quarterly sales report')]), stub);
  assertEquals(calls, ['text']);
  assertEquals(result.recipe.found_recipe, false);
});

Deno.test('no recipe in the text but a scanned page: the photo model reads the PDF', async () => {
  const { stub, calls } = readers({ text: NONE, file: recipe() });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES, 'scan']), stub);
  assertEquals(calls, ['text', 'file']);
  assertEquals(result.recipe.found_recipe, true);
});

Deno.test('a text model timeout falls back to the photo model', async () => {
  const timeout = new FetchError('test', 'OpenRouter request failed', { timedOut: true });
  const { stub, calls } = readers({ text: timeout, file: recipe() });
  const result = await extractRecipeFromPdf(await decoded([RECIPE_LINES]), stub);
  assertEquals(calls, ['text', 'file']);
  assertEquals(result.recipe.found_recipe, true);
});

Deno.test('the photo model is not started without time left', async () => {
  const { stub, calls } = readers({});
  const result = await extractRecipeFromPdf({ ...(await decoded(['scan'])), deadlineAt: Date.now() + 5_000 }, stub);
  assertEquals(calls, []);
  assertEquals(result.fileSkipped, 'out_of_time');
  assertEquals(result.recipe.found_recipe, false);
});

Deno.test('a PDF part goes to OpenRouter as a file data URL', () => {
  assertEquals(partsToOpenRouterContent([{ pdfBase64: 'JVBERi0x' }, { text: 'Extract.' }]), [
    { type: 'file', file: { filename: 'recipe.pdf', file_data: 'data:application/pdf;base64,JVBERi0x' } },
    { type: 'text', text: 'Extract.' },
  ]);
});
