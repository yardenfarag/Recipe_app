import { parseQuantity } from "@shared/lib/recipeEditor";

/**
 * Turns pasted text into ingredient or step rows, so a list copied from a website, a note or a message lands as
 * one row per line instead of one long field.
 */

export type PastedIngredient = { quantity: string; unit: string; name: string };

/** Bullets and list markers people paste with: "- ", "• ", "* ", "1. ", "2) ", "Step 3:". */
const BULLET = /^\s*(?:[-–—•*·▪◦○●✓✔☐□]+\s*|\(?\d{1,2}[.)]\s+|(?:step|paso|шаг|שלב|خطوة)\s*\d{1,2}\s*[:.)-]?\s*)/iu;

/** Units a pasted line may start with after its amount. Lower case; matched whole, with or without a final dot. */
const UNITS = new Set(
  [
    // English
    "cup", "cups", "c", "tbsp", "tbs", "tbl", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
    "g", "gr", "gram", "grams", "kg", "kilo", "kilos", "kilogram", "kilograms", "mg", "ml", "l", "liter", "liters",
    "litre", "litres", "dl", "cl", "oz", "ounce", "ounces", "fl oz", "lb", "lbs", "pound", "pounds", "pinch",
    "pinches", "dash", "dashes", "clove", "cloves", "can", "cans", "tin", "tins", "slice", "slices", "stick",
    "sticks", "bunch", "bunches", "handful", "handfuls", "piece", "pieces", "pc", "pcs", "package", "packages",
    "pkg", "packet", "packets", "jar", "jars", "sprig", "sprigs", "head", "heads", "quart", "quarts", "qt", "pint",
    "pints", "pt", "drop", "drops",
    // Spanish
    "taza", "tazas", "cucharada", "cucharadas", "cda", "cdas", "cucharadita", "cucharaditas", "cdta", "cdtas",
    "gramo", "gramos", "litro", "litros", "pizca", "pizcas", "diente", "dientes", "lata", "latas", "rebanada",
    "rebanadas", "manojo", "puñado",
    // Hebrew
    "כוס", "כוסות", "כף", "כפות", "כפית", "כפיות", "גרם", "גר׳", "ק\"ג", "ק״ג", "קילו", "מ\"ל", "מ״ל", "ליטר",
    "קורט", "שן", "שיני", "פרוסה", "פרוסות", "חבילה", "חבילות", "קופסה", "קופסת", "צרור", "חופן",
    // Russian
    "стакан", "стакана", "стаканов", "ст.л", "ст. л", "ч.л", "ч. л", "г", "гр", "кг", "мл", "л", "щепотка",
    "щепотки", "зубчик", "зубчика", "зубчиков", "банка", "банки", "ломтик", "ломтика", "пучок",
    // Arabic
    "كوب", "أكواب", "ملعقة", "ملاعق", "غرام", "غم", "جرام", "كيلو", "مل", "لتر", "رشة", "فص", "فصوص", "علبة", "شريحة",
    "حزمة",
  ].map((unit) => unit.toLowerCase()),
);

/** An amount at the start: "2", "1.5", "1,5", "1/2", "1 1/2", "1½", "½", or a range's first number ("2-3"). */
const AMOUNT = /^((?:\d+[.,]?\d*\s+)?\d+\s*\/\s*\d+|\d+[.,]?\d*\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞])(?:\s*[-–]\s*\d+[.,]?\d*)?/u;

/** Splits a pasted block into lines, without blank ones and without their bullets. */
function lines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean);
}

/** "2 cups flour" → 2 · cups · flour. "200g butter" → 200 · g · butter. "Salt to taste" → name only. */
export function parseIngredientLine(raw: string): PastedIngredient {
  const line = raw.replace(BULLET, "").trim();
  const amount = AMOUNT.exec(line);
  if (!amount) return { quantity: "", unit: "", name: line };
  // A range keeps its first number: the editor stores one amount.
  const quantityText = amount[1].replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
  if (parseQuantity(quantityText) === null) return { quantity: "", unit: "", name: line };
  let rest = line.slice(amount[0].length).trim();
  if (!rest) return { quantity: quantityText, unit: "", name: "" };

  let unit = "";
  // Two-word units first ("fl oz", "ст. л"), then one word, with or without a trailing dot. A unit glued to the
  // number ("200g butter") is a word of its own here too. A unit needs a name after it ("2 eggs" has none).
  const words = rest.split(/\s+/);
  for (const take of [2, 1]) {
    if (words.length <= take) continue;
    const candidate = words.slice(0, take).join(" ");
    const lower = candidate.toLowerCase();
    if (UNITS.has(lower) || UNITS.has(lower.replace(/\.$/, ""))) {
      unit = candidate.replace(/\.$/, "");
      rest = words.slice(take).join(" ");
      break;
    }
  }
  rest = rest.replace(/^of\s+/i, "").trim();
  return { quantity: quantityText, unit, name: rest };
}

/** One ingredient per line. Fewer than two lines isn't a list: the field takes the paste as typed. */
export function parseIngredientPaste(text: string): PastedIngredient[] | null {
  const found = lines(text);
  return found.length >= 2 ? found.map(parseIngredientLine) : null;
}

/**
 * Steps from a paste: paragraphs when the text has blank lines between them (a step can span lines), otherwise one
 * step per line. Null when it is a single step, so the field takes the paste as typed.
 */
export function parseStepPaste(text: string): string[] | null {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const paragraphs = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const steps =
    paragraphs.length >= 2
      ? paragraphs.map((block) => lines(block).join(" "))
      : lines(normalized);
  const cleaned = steps.map((step) => step.trim()).filter(Boolean);
  return cleaned.length >= 2 ? cleaned : null;
}
