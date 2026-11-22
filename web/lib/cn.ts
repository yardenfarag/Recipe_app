import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The corner sizes added in globals.css (rounded-tile, rounded-card, rounded-btn), so that a `rounded-*` passed to
// a kit component replaces the kit's own instead of sitting beside it.
const twMerge = extendTailwindMerge({ extend: { theme: { radius: ["tile", "card", "btn"] } } });

/** Joins class names; when two Tailwind classes clash, the later one wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
