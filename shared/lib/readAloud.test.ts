import { describe, expect, it, vi } from 'vitest';

import {
  baseLanguage,
  createSpeechQueue,
  pickVoice,
  speechLanguageTag,
  splitForSpeech,
  stepSpeech,
  voiceAvailability,
  type ReadAloudVoice,
  type SpeechEngine,
} from './readAloud';

describe('baseLanguage and speechLanguageTag', () => {
  it('reads the language out of a tag, and treats the old Hebrew code as Hebrew', () => {
    expect(baseLanguage('en-US')).toBe('en');
    expect(baseLanguage('he_IL')).toBe('he');
    expect(baseLanguage('iw-IL')).toBe('he');
    expect(baseLanguage('AR')).toBe('ar');
  });

  it('gives each app and recipe language a tag to ask for', () => {
    expect(speechLanguageTag('he')).toBe('he-IL');
    expect(speechLanguageTag('ru')).toBe('ru-RU');
    expect(speechLanguageTag('ar')).toBe('ar');
    expect(speechLanguageTag('fr')).toBe('fr-FR');
    expect(speechLanguageTag('pt-BR')).toBe('pt-BR');
  });
});

describe('pickVoice', () => {
  const voices: ReadAloudVoice[] = [
    { id: 'en-gb', language: 'en-GB' },
    { id: 'en-us', language: 'en-US' },
    { id: 'en-us-enhanced', language: 'en-US', enhanced: true },
    { id: 'he-android', language: 'iw-IL' },
    { id: 'es-mx-online', language: 'es-MX', local: false },
    { id: 'es-mx-local', language: 'es-MX', local: true },
  ];

  it('prefers the usual region, then better quality', () => {
    expect(pickVoice(voices, 'en')?.id).toBe('en-us-enhanced');
  });

  it('finds a Hebrew voice that Android reports as "iw"', () => {
    expect(pickVoice(voices, 'he')?.id).toBe('he-android');
  });

  it('prefers a voice on the device over one the browser streams from a server', () => {
    expect(pickVoice(voices, 'es')?.id).toBe('es-mx-local');
  });

  it('returns null when no voice speaks the language', () => {
    expect(pickVoice(voices, 'ar')).toBeNull();
  });
});

describe('voiceAvailability', () => {
  it('is unknown when the device lists no voices, so we still try', () => {
    expect(voiceAvailability(null, 'he')).toEqual({ status: 'unknown' });
    expect(voiceAvailability([], 'he')).toEqual({ status: 'unknown' });
  });

  it('is missing when voices exist but none for the language', () => {
    expect(voiceAvailability([{ id: 'a', language: 'en-US' }], 'he')).toEqual({ status: 'missing' });
  });

  it('is ready with the voice to use', () => {
    expect(voiceAvailability([{ id: 'a', language: 'he-IL' }], 'he')).toEqual({
      status: 'ready',
      voice: { id: 'a', language: 'he-IL' },
    });
  });
});

describe('splitForSpeech', () => {
  it('reads sentence by sentence, keeping decimals and temperatures whole', () => {
    expect(splitForSpeech('Heat the oven to 180 °C. Add 1.5 cups flour!  Stir well?')).toEqual([
      'Heat the oven to 180 °C.',
      'Add 1.5 cups flour!',
      'Stir well?',
    ]);
  });

  it('splits at line breaks and Arabic question marks', () => {
    expect(splitForSpeech('هل الفرن ساخن؟ أضف الدقيق\nثم حرك')).toEqual(['هل الفرن ساخن؟', 'أضف الدقيق', 'ثم حرك']);
  });

  it('cuts a very long sentence at commas, then at spaces', () => {
    const long = 'Add the onions, the garlic, the carrots, and the celery, then cook slowly';
    const pieces = splitForSpeech(long, 30);
    expect(pieces.every((piece) => piece.length <= 30)).toBe(true);
    expect(pieces.join(' ')).toBe(long);

    const words = splitForSpeech('one two three four five six seven', 10);
    expect(words.every((piece) => piece.length <= 10)).toBe(true);
    expect(words.join(' ')).toBe('one two three four five six seven');
  });

  it('returns nothing for blank text', () => {
    expect(splitForSpeech('   ')).toEqual([]);
  });
});

describe('stepSpeech', () => {
  it('reads the step label when it is in the same language as the step', () => {
    expect(stepSpeech({ text: 'Whisk.', label: 'Step 1 of 3', textLanguage: 'en', labelLanguage: 'en-US' })).toBe(
      'Step 1 of 3. Whisk.',
    );
  });

  it('reads only the step when the app and the recipe are in different languages', () => {
    expect(stepSpeech({ text: 'לערבב.', label: 'Step 1 of 3', textLanguage: 'he', labelLanguage: 'en' })).toBe('לערבב.');
  });
});

function fakeEngine() {
  const calls: { text: string; language: string; voiceId?: string; onDone: () => void; onError: () => void }[] = [];
  const engine: SpeechEngine = {
    speak: (text, options) => calls.push({ text, ...options }),
    stop: vi.fn(),
  };
  return { engine, calls };
}

describe('createSpeechQueue', () => {
  it('speaks one piece at a time, each after the last is done', () => {
    const { engine, calls } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('First. Second.', 'he', { id: 'carmit', language: 'he-IL' });
    expect(calls.map((call) => call.text)).toEqual(['First.']);
    expect(calls[0]).toMatchObject({ language: 'he-IL', voiceId: 'carmit' });
    expect(queue.isSpeaking()).toBe(true);

    calls[0]?.onDone();
    expect(calls.map((call) => call.text)).toEqual(['First.', 'Second.']);
    calls[1]?.onDone();
    expect(queue.isSpeaking()).toBe(false);
  });

  it('uses the language tag when there is no voice', () => {
    const { engine, calls } = fakeEngine();
    createSpeechQueue(engine).say('Hola.', 'es');
    expect(calls[0]).toMatchObject({ language: 'es-ES', voiceId: undefined });
  });

  it('cuts off the old step when a new one is read, and ignores its late callbacks', () => {
    const { engine, calls } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('Old one. Old two.', 'en');
    queue.say('New.', 'en');
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.text)).toEqual(['Old one.', 'New.']);

    // The cancelled utterance reports back late; it must not start "Old two."
    calls[0]?.onError();
    expect(calls.map((call) => call.text)).toEqual(['Old one.', 'New.']);
  });

  it('adds a finished timer after the step instead of cutting it off', () => {
    const { engine, calls } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('Simmer.', 'en');
    queue.append('Timer’s up.', 'en');
    expect(calls.map((call) => call.text)).toEqual(['Simmer.']);
    calls[0]?.onDone();
    expect(calls.map((call) => call.text)).toEqual(['Simmer.', 'Timer’s up.']);
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('starts an appended line at once when nothing is playing', () => {
    const { engine, calls } = fakeEngine();
    createSpeechQueue(engine).append('Timer’s up.', 'en');
    expect(calls).toHaveLength(1);
  });

  it('stops and forgets the rest', () => {
    const { engine, calls } = fakeEngine();
    const queue = createSpeechQueue(engine);
    queue.say('One. Two.', 'en');
    queue.stop();
    expect(engine.stop).toHaveBeenCalledTimes(1);
    calls[0]?.onDone();
    expect(calls).toHaveLength(1);
    expect(queue.isSpeaking()).toBe(false);
  });

  it('gives up quietly when the engine throws', () => {
    const queue = createSpeechQueue({
      speak: () => {
        throw new Error('no engine');
      },
      stop: vi.fn(),
    });
    expect(() => queue.say('Hi.', 'en')).not.toThrow();
    expect(queue.isSpeaking()).toBe(false);
  });
});
