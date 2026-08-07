import type { Instruction } from '@/types/recipe';

/**
 * Best-effort local rewrite when AI instruction patching is unavailable:
 * replace mentions of the old ingredient name with the substitute.
 * Preserves step order and `timestamp_seconds`.
 */
export function patchInstructionsForSubstitution(
  instructions: Instruction[],
  oldName: string,
  newName: string,
): Instruction[] {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from.localeCompare(to, undefined, { sensitivity: 'accent' }) === 0) {
    return instructions;
  }

  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word boundaries work for Latin; for Hebrew/Arabic/Cyrillic use a plain global replace.
  const useWordBoundary = /^[\p{Script=Latin}0-9\s'’.-]+$/u.test(from);
  const pattern = useWordBoundary
    ? new RegExp(`\\b${escaped}\\b`, 'gi')
    : new RegExp(escaped, 'gi');

  return instructions.map((step) => ({
    ...step,
    text: step.text.replace(pattern, to),
  }));
}

/**
 * Merge AI-rewritten step text onto the original steps, keeping timestamps
 * and falling back to originals when the model drops a step.
 */
export function mergeRewrittenInstructions(
  original: Instruction[],
  rewritten: { step: number; text: string }[],
): Instruction[] {
  if (rewritten.length === 0) return original;

  return rewritten.map((step, index) => {
    const stepNumber = Number.isFinite(Number(step.step)) ? Number(step.step) : index + 1;
    const prev =
      original.find((row) => row.step === stepNumber) ?? original[index] ?? undefined;
    const text = (step.text ?? '').trim() || prev?.text || '';
    const next: Instruction = { step: stepNumber, text };
    if (prev?.timestamp_seconds != null) {
      next.timestamp_seconds = prev.timestamp_seconds;
    }
    return next;
  });
}
