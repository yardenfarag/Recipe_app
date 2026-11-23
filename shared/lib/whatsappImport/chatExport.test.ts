import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { chatNameFromFileName, photoToBase64, readChatExport } from './chatExport';
import { MAX_CHAT_FILE_BYTES } from './constants';
import { WhatsAppImportError, type ChatExportFile } from './types';

const IOS_CHAT = [
  '[1/5/24, 18:22:10] Family Recipes: \u200EMessages and calls are end-to-end encrypted.',
  '[13/5/24, 18:23:00] Dana: \u200E<attached: 00000012-PHOTO-2024-05-13-18-23-00.jpg>',
  '[13/5/24, 18:23:30] Dana: Grandma’s apple cake',
  '[13/5/24, 18:24:00] Avi: https://www.tiktok.com/@chef/video/7350000000000000001',
].join('\n');

const ANDROID_CHAT = [
  '13/05/2024, 18:22 - Messages and calls are end-to-end encrypted. Tap to learn more.',
  '13/05/2024, 18:23 - Dana: IMG-20240513-WA0001.jpg (file attached)',
  'Grandma’s apple cake',
].join('\n');

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7]);

function expectError(file: ChatExportFile, code: string) {
  try {
    readChatExport(file);
  } catch (error) {
    expect(error).toBeInstanceOf(WhatsAppImportError);
    expect((error as WhatsAppImportError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('readChatExport: .txt', () => {
  it('reads a UTF-8 export with a BOM and names the chat from the file name', () => {
    const bytes = strToU8(`\uFEFF${ANDROID_CHAT}`);
    const chat = readChatExport({ name: 'WhatsApp Chat with Family Recipes.txt', bytes });
    expect(chat.chatName).toBe('Family Recipes');
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ sender: 'Dana', text: 'Grandma’s apple cake' });
    expect(chat.photoNames).toEqual([]);
    expect(chat.readPhoto('IMG-20240513-WA0001.jpg')).toBeNull();
  });

  it('throws not_a_chat for text that has no WhatsApp lines', () => {
    expectError({ name: 'notes.txt', bytes: strToU8('Shopping list\nmilk\neggs') }, 'not_a_chat');
    expectError({ name: 'photo.jpg', bytes: JPEG }, 'not_a_chat');
  });

  it('throws empty when the chat only has system lines', () => {
    const bytes = strToU8('13/05/2024, 18:22 - Messages and calls are end-to-end encrypted. Tap to learn more.');
    expectError({ name: 'WhatsApp Chat with X.txt', bytes }, 'empty');
  });

  it('throws too_big above the limit, before reading anything', () => {
    const huge = { length: MAX_CHAT_FILE_BYTES + 1 } as unknown as Uint8Array;
    expectError({ name: 'WhatsApp Chat with X.zip', bytes: huge }, 'too_big');
  });
});

describe('readChatExport: .zip', () => {
  it('reads an iOS export: _chat.txt plus photos, read one at a time', () => {
    const bytes = zipSync({
      '_chat.txt': strToU8(IOS_CHAT),
      '00000012-PHOTO-2024-05-13-18-23-00.jpg': [JPEG, { level: 0 }],
      '00000013-PHOTO-2024-05-13-18-25-00.png': PNG,
      '00000014-VIDEO-2024-05-13-18-26-00.mp4': new Uint8Array([1, 2, 3]),
      '00000015-AUDIO-2024-05-13-18-27-00.opus': new Uint8Array([1, 2, 3]),
    });
    const chat = readChatExport({ name: 'WhatsApp Chat - Family Recipes.zip', bytes });
    expect(chat.chatName).toBe('Family Recipes');
    expect(chat.messages.map((m) => m.sender)).toEqual(['Dana', 'Dana', 'Avi']);
    expect(chat.messages[0].attachments).toEqual(['00000012-PHOTO-2024-05-13-18-23-00.jpg']);
    expect(chat.photoNames.sort()).toEqual([
      '00000012-PHOTO-2024-05-13-18-23-00.jpg',
      '00000013-PHOTO-2024-05-13-18-25-00.png',
    ]);
    expect(chat.readPhoto('00000012-PHOTO-2024-05-13-18-23-00.jpg')).toEqual(JPEG);
    expect(chat.readPhoto('00000013-PHOTO-2024-05-13-18-25-00.png')).toEqual(PNG);
    expect(chat.readPhoto('00000014-VIDEO-2024-05-13-18-26-00.mp4')).toBeNull();
    expect(chat.readPhoto('missing.jpg')).toBeNull();
  });

  it('reads an Android export named after the chat, in a folder, whatever the outer file is called', () => {
    const bytes = zipSync({
      'Family/WhatsApp Chat with Family.txt': strToU8(ANDROID_CHAT),
      'Family/IMG-20240513-WA0001.jpg': JPEG,
      '__MACOSX/Family/._IMG-20240513-WA0001.jpg': new Uint8Array([0]),
    });
    const chat = readChatExport({ name: 'download (3).bin', bytes });
    expect(chat.chatName).toBe('Family');
    expect(chat.photoNames).toEqual(['Family/IMG-20240513-WA0001.jpg']);
    expect(chat.readPhoto('IMG-20240513-WA0001.jpg')).toEqual(JPEG);
    expect(chat.readPhoto('Family/IMG-20240513-WA0001.jpg')).toEqual(JPEG);
  });

  it('uses the only .txt when it has another name, and skips text files that are not chats', () => {
    const bytes = zipSync({
      'readme.txt': strToU8('hello'),
      'export.txt': strToU8(ANDROID_CHAT),
    });
    const chat = readChatExport({ name: 'chat.zip', bytes });
    expect(chat.messages).toHaveLength(1);
    expect(chat.chatName).toBeUndefined();
  });

  it('throws not_a_chat for a zip without a chat, or a broken zip', () => {
    expectError({ name: 'photos.zip', bytes: zipSync({ 'a.jpg': JPEG }) }, 'not_a_chat');
    const broken = zipSync({ '_chat.txt': strToU8(IOS_CHAT) }).slice(0, 40);
    expectError({ name: 'chat.zip', bytes: broken }, 'not_a_chat');
  });

  it('throws empty for a zipped chat with no messages', () => {
    const bytes = zipSync({ '_chat.txt': strToU8('[1/5/24, 18:22:10] Family: \u200EMessages and calls are end-to-end encrypted.') });
    expectError({ name: 'chat.zip', bytes }, 'empty');
  });
});

describe('chatNameFromFileName', () => {
  it.each([
    ['WhatsApp Chat with Family Recipes.txt', 'Family Recipes'],
    ['WhatsApp Chat - Family Recipes.zip', 'Family Recipes'],
    ['WhatsApp Chat with Mum (1).txt', 'Mum'],
    ['Chat de WhatsApp con Mamá.txt', 'Mamá'],
    ['Чат WhatsApp с Мамой.txt', 'Мамой'],
    ['_chat.txt', undefined],
    ['export.zip', undefined],
  ])('%s → %s', (fileName, name) => {
    expect(chatNameFromFileName(fileName)).toBe(name);
  });
});

describe('photoToBase64', () => {
  it('encodes the bytes, also for a view into a larger buffer', () => {
    expect(photoToBase64(JPEG)).toBe(Buffer.from(JPEG).toString('base64'));
    const view = new Uint8Array([9, 9, ...PNG, 9]).subarray(2, 2 + PNG.length);
    expect(photoToBase64(view)).toBe(Buffer.from(PNG).toString('base64'));
  });
});
