import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_PDF_BYTES } from '@shared/lib/supabase/extractRecipe';

import { pickRecipePdf, readRecipePdf, sharedRecipeFile } from './recipePdf';

const mocks = vi.hoisted(() => ({
  files: new Map<string, { size: number | null; base64: string }>(),
  opened: [] as string[],
  getDocumentAsync: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  File: class {
    size: number | null;
    private readonly content: string;
    constructor(uri: string) {
      mocks.opened.push(uri);
      const file = mocks.files.get(uri);
      if (!file) throw new Error('no such file');
      this.size = file.size;
      this.content = file.base64;
    }
    async base64() {
      return this.content;
    }
  },
}));

vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.getDocumentAsync }));

describe('sharedRecipeFile', () => {
  it('takes a shared photo, as before', () => {
    expect(sharedRecipeFile([{ path: '/tmp/card.jpg', mimeType: 'image/jpeg' }])).toEqual({
      kind: 'image',
      path: '/tmp/card.jpg',
    });
  });

  it('takes a shared PDF, by its type or, failing that, its name', () => {
    expect(sharedRecipeFile([{ path: '/tmp/a.bin', mimeType: 'application/pdf', size: 1200 }])).toEqual({
      kind: 'pdf',
      path: '/tmp/a.bin',
      size: 1200,
    });
    expect(
      sharedRecipeFile([{ path: '/tmp/x', mimeType: 'application/octet-stream', fileName: 'Lasagne.PDF' }]),
    ).toEqual({ kind: 'pdf', path: '/tmp/x', size: null });
  });

  it('a photo wins over a PDF, and anything else is not a recipe file', () => {
    expect(
      sharedRecipeFile([
        { path: '/tmp/a.pdf', mimeType: 'application/pdf' },
        { path: '/tmp/b.png', mimeType: 'image/png' },
      ])?.kind,
    ).toBe('image');
    expect(sharedRecipeFile([{ path: '/tmp/a.docx', mimeType: 'application/msword' }])).toBeNull();
    expect(sharedRecipeFile(null)).toBeNull();
  });
});

describe('readRecipePdf', () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.opened.length = 0;
    mocks.getDocumentAsync.mockReset();
  });

  it('reads a shared path as a file URI', async () => {
    mocks.files.set('file:///cache/recipe.pdf', { size: 2000, base64: 'JVBERi0x' });
    expect(await readRecipePdf('/cache/recipe.pdf')).toEqual({ ok: true, base64: 'JVBERi0x' });
  });

  it('turns away a PDF over the limit before reading it', async () => {
    mocks.files.set('file:///cache/big.pdf', { size: MAX_PDF_BYTES + 1, base64: 'never read' });
    expect(await readRecipePdf('file:///cache/big.pdf')).toEqual({ ok: false, reason: 'too_large' });
    expect(await readRecipePdf('file:///cache/big.pdf', 10)).toEqual({ ok: true, base64: 'never read' });
  });

  it('a file that cannot be opened is unreadable', async () => {
    expect(await readRecipePdf('file:///cache/missing.pdf')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('picks one PDF, and a closed picker is no PDF', async () => {
    mocks.files.set('file:///cache/picked.pdf', { size: 10, base64: 'JVBERi0x' });
    mocks.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/picked.pdf', size: 10, name: 'picked.pdf', lastModified: 0 }],
    });
    expect(await pickRecipePdf()).toEqual({ ok: true, base64: 'JVBERi0x' });
    expect(mocks.getDocumentAsync).toHaveBeenCalledWith({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    mocks.getDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickRecipePdf()).toBeNull();
  });
});
