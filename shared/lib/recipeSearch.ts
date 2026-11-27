/**
 * Searching saved recipes the way people type: "something with eggs", "pasta tomato", "משהו עם ביצים". The words
 * that only carry the sentence ("something", "with", "עם", "con"…) are dropped, and a recipe matches when every
 * word left appears in its title, ingredients or tags. A word also matches its singular or a form without a
 * common prefix ("eggs" finds "egg", "ביצים" finds "ביצה" and back, "بالبيض" finds "بيض"), so plain spelling is enough.
 */

/** Words that say nothing about the food, in the five app languages. */
const FILLER = new Set(
  [
    // English
    'a an the and or of for to in on with without using use uses some something anything any me my i want would like',
    'recipe recipes dish dishes food make cook cooking that has have had which can could please',
    // Spanish
    'algo un una unos unas el la los las de del con y o para que tenga lleve receta recetas plato comida algún alguna',
    // Hebrew
    'משהו עם של את או גם מתכון מתכונים מנה שיש בו בה כמו אני רוצה',
    // Arabic
    'شيء شي مع في من أو او و وصفة وصفات طبق فيه فيها اريد أريد',
    // Russian
    'что-нибудь что-то чтото что с со и или в на для из рецепт рецепты блюдо хочу какой-нибудь',
  ]
    .join(' ')
    .split(' '),
);

/**
 * Endings to try without, longest first: plurals, common case endings, and the feminine singular ("ביצה" and
 * "ביצים" share "ביצ").
 */
const SUFFIXES = ['ами', 'ями', 'es', 'ים', 'ות', 'ات', 'ов', 'ей', 'ах', 's', 'ы', 'и', 'а', 'я', 'у', 'ة', 'ה'];
/** Letters glued to the front of a word: Arabic "the", "with the", "and"; Hebrew "the", "and", "in". */
const PREFIXES = ['وال', 'بال', 'لل', 'ال', 'و', 'ب', 'ל', 'ה', 'ו', 'ב'];

const MIN_STEM = 3;

function stripSuffix(word: string): string | null {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM) return word.slice(0, -suffix.length);
  }
  return null;
}

function stripPrefix(word: string): string | null {
  for (const prefix of PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= MIN_STEM) return word.slice(prefix.length);
  }
  return null;
}

/** The ways a typed word may appear in a recipe. */
function forms(word: string): string[] {
  const all = new Set([word]);
  const bare = stripPrefix(word);
  for (const base of bare ? [word, bare] : [word]) {
    all.add(base);
    const stem = stripSuffix(base);
    if (stem) all.add(stem);
  }
  return [...all];
}

export type RecipeSearch = {
  /** Each meaningful word, as the forms any of which counts as a match. Empty: match everything. */
  words: string[][];
  /** The whole query, for a query made only of filler words ("with"), matched as typed. */
  phrase: string;
};

/** Reads what was typed. Call once per query, then `matchesRecipeSearch` for each recipe. */
export function parseRecipeSearch(query: string): RecipeSearch {
  const phrase = query.trim().toLocaleLowerCase();
  const words = phrase
    .split(/[\s,.;:!?"'“”„«»()\[\]{}/\\״׳]+/u)
    .map((word) => word.replace(/^-+|-+$/g, ''))
    .filter((word) => word.length > 0 && !FILLER.has(word))
    .map(forms);
  return { words, phrase };
}

/** `haystack` is a recipe's searchable text, already lower-cased. */
export function matchesRecipeSearch(haystack: string, search: RecipeSearch): boolean {
  if (!search.phrase) return true;
  if (search.words.length === 0) return haystack.includes(search.phrase);
  return search.words.every((alternatives) => alternatives.some((form) => haystack.includes(form)));
}
