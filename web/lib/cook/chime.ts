/**
 * A short three-note chime for a finished kitchen timer, made with Web Audio so there is no sound file to load.
 * `primeChime` must run from a tap (starting a timer): browsers only let audio start from a user gesture, and an
 * AudioContext created then can play later. Fails silently where audio is unavailable.
 */

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
    return context;
  } catch {
    return null;
  }
}

export function primeChime(): void {
  const audio = audioContext();
  if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
}

export function playChime(): void {
  const audio = audioContext();
  if (!audio) return;
  try {
    const start = audio.currentTime + 0.05;
    [880, 1108.73, 1318.51].forEach((frequency, index) => {
      const at = start + index * 0.22;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.65);
    });
  } catch {
    // No sound is better than a broken page.
  }
}
