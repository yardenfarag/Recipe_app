import { describe, expect, it } from 'vitest';

import { parseChat, parseChatText } from './parseChat';

const LRM = '\u200E';
const RLM = '\u200F';
const NNBSP = '\u202F';

describe('parseChatText: iOS', () => {
  it('reads messages with seconds, senders and multi-line text', () => {
    const text = [
      `[1/5/24, 18:22:10] Family Recipes: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
      `[1/5/24, 18:22:10] Family Recipes: ${LRM}Dana created group “Family Recipes”`,
      '[13/5/24, 18:23:00] Dana: Hi all',
      '[13/5/24, 18:24:00] Avi Cohen: First line',
      'second line',
      '',
      'fourth line',
      '[14/5/24, 09:00:00] Dana: Bye',
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.sender, m.text])).toEqual([
      ['Dana', 'Hi all'],
      ['Avi Cohen', 'First line\nsecond line\n\nfourth line'],
      ['Dana', 'Bye'],
    ]);
    expect(messages.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(messages[0].sentAt).toBe('2024-05-13T18:23:00');
    expect(messages[2].sentAt).toBe('2024-05-14T09:00:00');
  });

  it('reads dotted dates', () => {
    const [message] = parseChatText('[01.05.24, 18:22:10] Dana: Hallo');
    expect(message.sentAt).toBe('2024-05-01T18:22:10');
  });

  it('reads the 12-hour clock with a narrow no-break space and infers month-first', () => {
    const text = [
      `[5/1/24, 6:22:10${NNBSP}PM] Dana: evening`,
      `[5/13/24, 12:05:00${NNBSP}AM] Dana: midnight`,
      `[5/13/24, 12:05:00${NNBSP}PM] Dana: noon`,
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => m.sentAt)).toEqual([
      '2024-05-01T18:22:10',
      '2024-05-13T00:05:00',
      '2024-05-13T12:05:00',
    ]);
  });

  it('turns <attached: …> into attachments and keeps the rest as text', () => {
    const text = [
      `[1/5/24, 18:22:10] Dana: ${LRM}<attached: 00000012-PHOTO-2024-05-01-18-22-10.jpg>`,
      `[1/5/24, 18:22:30] Dana: ${LRM}<adjunto: 00000013-PHOTO-2024-05-01-18-22-30.jpg>`,
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages).toHaveLength(2);
    expect(messages[0].attachments).toEqual(['00000012-PHOTO-2024-05-01-18-22-10.jpg']);
    expect(messages[0].text).toBe('');
    expect(messages[1].attachments).toEqual(['00000013-PHOTO-2024-05-01-18-22-30.jpg']);
  });

  it('drops WhatsApp notes such as omitted media, deleted messages and missed calls', () => {
    const text = [
      `[1/5/24, 18:22:10] Dana: ${LRM}image omitted`,
      `[1/5/24, 18:22:11] Dana: ${LRM}This message was deleted.`,
      `[1/5/24, 18:22:12] Dana: ${LRM}Missed voice call`,
      '[1/5/24, 18:22:13] Dana: real text',
      `[1/5/24, 18:22:14] Dana: edited text ${LRM}<This message was edited>`,
    ].join('\n');
    expect(parseChatText(text).map((m) => m.text)).toEqual(['real text', 'edited text']);
  });

  it('keeps a marked message that has a link', () => {
    const [message] = parseChatText(`[1/5/24, 18:22:10] Dana: ${LRM}https://www.tiktok.com/@a/video/123`);
    expect(message.text).toBe('https://www.tiktok.com/@a/video/123');
  });
});

describe('parseChatText: Android', () => {
  it('reads short and long years, drops system lines, keeps multi-line text', () => {
    const text = [
      '1/5/24, 18:22 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.',
      '1/5/24, 18:22 - Dana created group "Family"',
      '1/5/24, 18:23 - Dana added Avi',
      '1/5/24, 18:24 - Dana changed the subject from "Food" to "Recipes: family"',
      '01/05/2024, 18:25 - Avi: Cake recipe',
      '2 cups flour',
      '25/12/2024, 07:05 - Dana: Merry Christmas',
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.sender, m.text, m.sentAt])).toEqual([
      ['Avi', 'Cake recipe\n2 cups flour', '2024-05-01T18:25:00'],
      ['Dana', 'Merry Christmas', '2024-12-25T07:05:00'],
    ]);
  });

  it('reads 12-hour Android lines and Windows line endings with a BOM', () => {
    const text = `\uFEFF5/1/24, 6:22${NNBSP}PM - Dana: hello\r\n5/30/24, 7:00 AM - Avi: morning\r\n`;
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.sender, m.text, m.sentAt])).toEqual([
      ['Dana', 'hello', '2024-05-01T18:22:00'],
      ['Avi', 'morning', '2024-05-30T07:00:00'],
    ]);
  });

  it('turns "(file attached)" lines into attachments in any language, caption on the next line', () => {
    const text = [
      '1/5/24, 18:22 - Dana: IMG-20240501-WA0003.jpg (file attached)',
      'Grandma’s cake',
      '1/5/24, 18:23 - Avi: IMG-20240501-WA0004.jpg (archivo adjunto)',
      '1/5/24, 18:24 - Avi: VID-20240501-WA0005.mp4 (файл прикреплен)',
      '1/5/24, 18:25 - Avi: <Media omitted>',
      '1/5/24, 18:26 - Avi: <Multimedia omitido>',
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.text, m.attachments])).toEqual([
      ['Grandma’s cake', ['IMG-20240501-WA0003.jpg']],
      ['', ['IMG-20240501-WA0004.jpg']],
      ['', ['VID-20240501-WA0005.mp4']],
    ]);
  });

  it('reads Hebrew exports with direction marks anywhere in the line', () => {
    const text = [
      `${RLM}15.5.2024, 18:22 - ${RLM}דנה כהן: ${RLM}IMG-20240515-WA0001.jpg (קובץ מצורף)`,
      'עוגת שוקולד של סבתא',
      `15.5.2024, 18:23 - ${LRM}+972 50-123-4567${LRM}: מתכון מעולה`,
      `${RLM}15.5.2024, 18:24 - ${RLM}דנה כהן הוסיפה את אבי`,
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.sender, m.text, m.attachments, m.sentAt])).toEqual([
      ['דנה כהן', 'עוגת שוקולד של סבתא', ['IMG-20240515-WA0001.jpg'], '2024-05-15T18:22:00'],
      ['+972 50-123-4567', 'מתכון מעולה', [], '2024-05-15T18:23:00'],
    ]);
  });

  it('reads Arabic exports with Arabic-Indic digits, the Arabic comma and ص/م', () => {
    const text = [
      `${RLM}١٥/٥/٢٠٢٤، ٦:٢٢ م - ${RLM}سارة: وصفة الكبة`,
      '٢ كوب برغل',
      `${RLM}١٦/٥/٢٠٢٤، ٩:٠٥ ص - ${RLM}أحمد: شكرا`,
    ].join('\n');
    const messages = parseChatText(text);
    expect(messages.map((m) => [m.sender, m.text, m.sentAt])).toEqual([
      ['سارة', 'وصفة الكبة\n٢ كوب برغل', '2024-05-15T18:22:00'],
      ['أحمد', 'شكرا', '2024-05-16T09:05:00'],
    ]);
  });

  it('strips the "~" WhatsApp puts before people who are not in your contacts', () => {
    const [message] = parseChatText('1/5/24, 18:22 - ~\u00A0Dana: hi');
    expect(message.sender).toBe('Dana');
  });
});

describe('parseChatText: dates', () => {
  it('falls back to day-first when nothing decides the order', () => {
    const [message] = parseChatText('3/4/24, 10:00 - Dana: hi');
    expect(message.sentAt).toBe('2024-04-03T10:00:00');
  });

  it('decides the order from any line in the file', () => {
    const messages = parseChatText(['3/4/24, 10:00 - Dana: hi', '3/14/24, 10:00 - Dana: pi day'].join('\n'));
    expect(messages.map((m) => m.sentAt)).toEqual(['2024-03-04T10:00:00', '2024-03-14T10:00:00']);
  });

  it('reads year-first dates', () => {
    const [message] = parseChatText('[2024-05-01, 18:22:10] Dana: hej');
    expect(message.sentAt).toBe('2024-05-01T18:22:10');
  });

  it('gives null for impossible dates but keeps the message', () => {
    const [message] = parseChatText('31/2/24, 10:00 - Dana: hi');
    expect(message.text).toBe('hi');
    expect(message.sentAt).toBeNull();
  });
});

describe('parseChat', () => {
  it('counts dated lines so "not a chat" differs from "no messages"', () => {
    expect(parseChat('hello\nworld').datedLines).toBe(0);
    const systemOnly = parseChat('1/5/24, 18:22 - Dana created group "Family"');
    expect(systemOnly.datedLines).toBe(1);
    expect(systemOnly.messages).toEqual([]);
  });
});
