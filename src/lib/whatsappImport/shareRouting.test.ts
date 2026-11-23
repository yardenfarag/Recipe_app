import { describe, expect, it } from 'vitest';

import { isWhatsAppExportFile, whatsAppExportInShare } from '@/lib/whatsappImport/shareRouting';

describe('isWhatsAppExportFile', () => {
  it('takes the .zip iPhone WhatsApp makes', () => {
    expect(
      isWhatsAppExportFile({ path: '/tmp/x', fileName: 'WhatsApp Chat - Family Recipes.zip', mimeType: 'application/zip' }),
    ).toBe(true);
  });

  it('takes any .zip, even one typed as a plain file, and lets the import screen check it', () => {
    expect(isWhatsAppExportFile({ path: '/tmp/export.zip', mimeType: 'application/octet-stream' })).toBe(true);
    expect(isWhatsAppExportFile({ path: 'content://x/42', fileName: 'archive', mimeType: 'application/zip' })).toBe(
      true,
    );
  });

  it('takes a chat .txt by its name', () => {
    expect(isWhatsAppExportFile({ path: '/a/WhatsApp Chat with Mum.txt', mimeType: 'text/plain' })).toBe(true);
    expect(isWhatsAppExportFile({ path: '/a/_chat.txt', mimeType: 'text/plain' })).toBe(true);
    expect(isWhatsAppExportFile({ path: '/a/x', fileName: 'Chat de WhatsApp con Ana.txt' })).toBe(true);
  });

  it('leaves other files to Snap', () => {
    expect(isWhatsAppExportFile({ path: '/a/notes.txt', mimeType: 'text/plain' })).toBe(false);
    expect(isWhatsAppExportFile({ path: '/a/recipe.pdf', mimeType: 'application/pdf' })).toBe(false);
    expect(isWhatsAppExportFile({ path: '/a/IMG_1.jpg', mimeType: 'image/jpeg' })).toBe(false);
  });
});

describe('whatsAppExportInShare', () => {
  it('returns null for a link or text share (no files), which stays with Snap', () => {
    expect(whatsAppExportInShare(null)).toBeNull();
    expect(whatsAppExportInShare([])).toBeNull();
  });

  it('returns null for a photo or PDF share', () => {
    expect(whatsAppExportInShare([{ path: '/a/IMG_1.jpg', mimeType: 'image/jpeg' }])).toBeNull();
    expect(whatsAppExportInShare([{ path: '/a/r.pdf', mimeType: 'application/pdf' }])).toBeNull();
  });

  it('turns a plain path into a file URI and keeps the name and size', () => {
    expect(
      whatsAppExportInShare([
        { path: '/data/user/0/app/cache/WhatsApp Chat - Fam.zip', mimeType: 'application/zip', size: 1234 },
      ]),
    ).toEqual({
      uri: 'file:///data/user/0/app/cache/WhatsApp Chat - Fam.zip',
      name: 'WhatsApp Chat - Fam.zip',
      size: 1234,
    });
  });

  it('keeps content and file URIs as they are, and decodes a name taken from the path', () => {
    expect(whatsAppExportInShare([{ path: 'file:///x/WhatsApp%20Chat%20-%20A.zip' }])).toEqual({
      uri: 'file:///x/WhatsApp%20Chat%20-%20A.zip',
      name: 'WhatsApp Chat - A.zip',
      size: null,
    });
  });

  it('picks the chat out of a share that also has photos', () => {
    const chat = whatsAppExportInShare([
      { path: '/a/IMG_1.jpg', mimeType: 'image/jpeg' },
      { path: '/a/WhatsApp Chat with Fam.txt', mimeType: 'text/plain' },
    ]);
    expect(chat?.name).toBe('WhatsApp Chat with Fam.txt');
  });
});
