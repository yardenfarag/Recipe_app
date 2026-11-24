import type { Instruction } from '../types/recipe';

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
 * The recipe's own steps with the AI-rewritten text put in, step for step. The recipe keeps every step, with its
 * number and timestamp; an empty rewritten step keeps its text.
 *
 * Null when the rewrite doesn't have exactly the recipe's steps (PIN-186: a shorter rewrite used to be saved as it
 * came, and the missing steps were lost). Which step was dropped can't be known, so none of it is used and the
 * caller falls back to `patchInstructionsForSubstitution`. suggest-substitution refuses such a rewrite itself; this
 * is the second check.
 */
export function mergeRewrittenInstructions(
  original: Instruction[],
  rewritten: { step: number; text: string }[],
): Instruction[] | null {
  if (rewritten.length === 0 || rewritten.length !== original.length) return null;

  return original.map((step, index) => ({
    ...step,
    text: (rewritten[index]?.text ?? '').trim() || step.text,
  }));
}
