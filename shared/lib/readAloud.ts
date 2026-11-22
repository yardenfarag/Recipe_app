/**
 * Cook mode's "read aloud": which voice reads a step, how the text is cut up, and a small queue that speaks
 * one piece after another. The speech engine itself comes from each app (expo-speech on mobile,
 * `speechSynthesis` on web), passed in as a `SpeechEngine`.
 */

/** A voice as both apps see it. `id` is what the engine needs to pick it (identifier / voiceURI). */
export type ReadAloudVoice = {
  id: string;
  /** BCP 47 tag as the platform reports it: "en-US", "he_IL", "iw-IL"… */
  language: string;
  name?: string;
  /** iOS "Enhanced" voices sound much better than the defaults. */
  enhanced?: boolean;
  /** Web: false means the browser sends the text to a server to be spoken. */
  local?: boolean;
  /** Web: the browser's default voice. */
  isDefault?: boolean;
};

/** The tag we ask for when a device lists no voices (or we have none picked). */
const LANGUAGE_TAGS: Record<string, string> = {
  en: 'en-US',
  he: 'he-IL',
  ar: 'ar',
  es: 'es-ES',
  ru: 'ru-RU',
  de: 'de-DE',
  fr: 'fr-FR',
};

/** "he-IL" → "he". Old Java locales call Hebrew "iw", and some Android voices still do. */
export function baseLanguage(tag: string): string {
  const base = tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? '';
  return base === 'iw' ? 'he' : base;
}

export function speechLanguageTag(code: string): string {
  return LANGUAGE_TAGS[baseLanguage(code)] ?? code;
}

/**
 * The best voice for a language, or null when the device has none. Prefers the usual region ("he-IL" for
 * Hebrew), then voices on the device over network ones, then better quality, then the browser's default.
 */
export function pickVoice(voices: readonly ReadAloudVoice[], code: string): ReadAloudVoice | null {
  const base = baseLanguage(code);
  const preferredTag = speechLanguageTag(code).toLowerCase();
  const score = (voice: ReadAloudVoice) => {
    const tag = voice.language.replace('_', '-').toLowerCase();
    return (
      (tag === preferredTag ? 8 : 0) +
      (voice.local === false ? 0 : 4) +
      (voice.enhanced ? 2 : 0) +
      (voice.isDefault ? 1 : 0)
    );
  };
  let best: ReadAloudVoice | null = null;
  for (const voice of voices) {
    if (baseLanguage(voice.language) !== base) continue;
    if (!best || score(voice) > score(best)) best = voice;
  }
  return best;
}

/**
 * What read aloud can do for a language on this device:
 * - "ready": there is a voice for it.
 * - "unknown": the device listed no voices at all (some Android engines, before they warm up). We still try,
 *   with the language tag only.
 * - "missing": the device lists voices, none for this language. Don't read Hebrew with an English voice.
 */
export type VoiceAvailability = { status: 'ready'; voice: ReadAloudVoice } | { status: 'unknown' } | { status: 'missing' };

export function voiceAvailability(voices: readonly ReadAloudVoice[] | null, code: string): VoiceAvailability {
  if (!voices || voices.length === 0) return { status: 'unknown' };
  const voice = pickVoice(voices, code);
  return voice ? { status: 'ready', voice } : { status: 'missing' };
}

const SENTENCE_END = new Set(['.', '!', '?', '؟', '۔', '…']);
const SOFT_BREAK = new Set([',', ';', ':', '،', '؛']);

/** Splits after any of `marks` that is followed by a space (so "1.5 cups" stays whole) and at line breaks. */
function splitAfter(text: string, marks: Set<string>): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? '';
    if (char === '\n') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
    const following = text[i + 1];
    if (marks.has(char) && (following === undefined || /\s/.test(following))) {
      parts.push(current);
      current = '';
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Cuts text into pieces short enough to speak in one go. Chrome stops long utterances with its online voices
 * after about 15 seconds, and engines have input limits, so we speak sentence by sentence; a very long
 * sentence is cut at commas, then at spaces.
 */
export function splitForSpeech(text: string, maxLength = 200): string[] {
  const pieces: string[] = [];
  const pushLong = (sentence: string) => {
    if (sentence.length <= maxLength) {
      pieces.push(sentence);
      return;
    }
    let current = '';
    const parts = splitAfter(sentence, SOFT_BREAK).flatMap((part) => (part.length <= maxLength ? [part] : part.split(/\s+/)));
    for (const part of parts) {
      if (!part) continue;
      const next = current ? `${current} ${part}` : part;
      if (next.length > maxLength && current) {
        pieces.push(current);
        current = part;
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
  };
  for (const sentence of splitAfter(text, SENTENCE_END)) pushLong(sentence);
  return pieces;
}

/**
 * The words read for a step. The "Step 2 of 6" label is in the app's language and the step in the recipe's,
 * so the label is only read when both are the same language: one voice reads it all, and a Hebrew voice never
 * has to read English.
 */
export function stepSpeech({
  text,
  label,
  textLanguage,
  labelLanguage,
}: {
  text: string;
  label: string;
  textLanguage: string;
  labelLanguage: string;
}): string {
  const body = text.trim();
  if (baseLanguage(textLanguage) !== baseLanguage(labelLanguage)) return body;
  return `${label}. ${body}`;
}

/** What each app gives the queue: speak one piece, and stop everything. */
export type SpeechEngine = {
  speak: (
    text: string,
    options: { language: string; voiceId?: string; onDone: () => void; onError: () => void },
  ) => void;
  stop: () => void;
};

export type SpeechQueue = {
  /** Stops what is being read and reads this instead. */
  say: (text: string, language: string, voice?: ReadAloudVoice | null) => void;
  /** Reads this after whatever is being read now (a finished timer doesn't cut a step off). */
  append: (text: string, language: string, voice?: ReadAloudVoice | null) => void;
  stop: () => void;
  isSpeaking: () => boolean;
};

type Piece = { text: string; language: string; voiceId?: string };

/**
 * Speaks pieces one after another. Every stop bumps a generation number, so callbacks from speech that was
 * cut off (engines report a cancelled utterance as done or as an error) can't start the next piece.
 */
export function createSpeechQueue(engine: SpeechEngine): SpeechQueue {
  let generation = 0;
  let pending: Piece[] = [];
  let speaking = false;

  const toPieces = (text: string, language: string, voice?: ReadAloudVoice | null): Piece[] => {
    const tag = voice?.language ?? speechLanguageTag(language);
    return splitForSpeech(text).map((piece) => ({ text: piece, language: tag, voiceId: voice?.id }));
  };

  const next = (run: number) => {
    if (run !== generation) return;
    const piece = pending.shift();
    if (!piece) {
      speaking = false;
      return;
    }
    speaking = true;
    const finished = () => next(run);
    try {
      engine.speak(piece.text, { language: piece.language, voiceId: piece.voiceId, onDone: finished, onError: finished });
    } catch {
      pending = [];
      speaking = false;
    }
  };

  const stop = () => {
    generation += 1;
    pending = [];
    if (speaking) {
      speaking = false;
      try {
        engine.stop();
      } catch {
        // Nothing to stop.
      }
    }
  };

  return {
    say(text, language, voice) {
      stop();
      pending = toPieces(text, language, voice);
      next(generation);
    },
    append(text, language, voice) {
      pending.push(...toPieces(text, language, voice));
      if (!speaking) next(generation);
    },
    stop,
    isSpeaking: () => speaking,
  };
}

/** The device setting's storage key, the same on mobile and web. Stored as "on" or "off". */
export const READ_ALOUD_STORAGE_KEY = 'pinch:cookReadAloud';
