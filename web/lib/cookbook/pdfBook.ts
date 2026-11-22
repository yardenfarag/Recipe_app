import type { CookbookBook, CookbookHtmlRecipe } from "@shared/lib/cookbook/buildCookbookHtml";

/**
 * What the PDF server accepts: the book as plain data (`buildCookbookBook`), never HTML. The server lays the pages
 * out itself with the shared builder, which escapes every word, so a request can only ever print a Pinch cookbook.
 * The limits are far above any real book and keep one request from tying up a browser for long.
 */
export const PDF_LIMITS = {
  /** The request body, in bytes. 200 long recipes come to about 2 MB. */
  bodyBytes: 4_000_000,
  recipes: 200,
  rows: 300,
  shortText: 300,
  longText: 6_000,
  url: 2_048,
} as const;

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/;

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

/** A photo the server's browser may fetch: https only, so nothing on a private network or another scheme. */
function photoUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > PDF_LIMITS.url) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function list<T>(value: unknown, max: number, item: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const out: T[] = [];
  for (const entry of value) {
    const parsed = item(entry);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function recipe(value: unknown): CookbookHtmlRecipe | null {
  if (!isObject(value)) return null;
  const title = text(value.title, PDF_LIMITS.shortText);
  const source = text(value.source, PDF_LIMITS.shortText);
  const servingsLabel = text(value.servingsLabel, PDF_LIMITS.shortText);
  const timeLabel = text(value.timeLabel, PDF_LIMITS.shortText);
  const image = photoUrl(value.imageDataUri);
  const lang = value.lang === undefined ? undefined : text(value.lang, 35);
  const dir = value.dir === undefined ? undefined : value.dir === "ltr" || value.dir === "rtl" ? value.dir : null;
  const ingredients = list(value.ingredients, PDF_LIMITS.rows, (row) => {
    if (!isObject(row)) return null;
    const amount = text(row.amount, PDF_LIMITS.shortText);
    const name = text(row.name, PDF_LIMITS.longText);
    return amount === null || name === null ? null : { amount, name };
  });
  const instructions = list(value.instructions, PDF_LIMITS.rows, (row) => {
    if (!isObject(row)) return null;
    const step = typeof row.step === "number" && Number.isInteger(row.step) && row.step >= 0 && row.step <= 10_000 ? row.step : null;
    const body = text(row.text, PDF_LIMITS.longText);
    return step === null || body === null ? null : { step, text: body };
  });
  if (title === null || source === null || servingsLabel === null || timeLabel === null || image === undefined) return null;
  if (lang === null || (lang !== undefined && !LANGUAGE_TAG.test(lang)) || dir === null || !ingredients || !instructions) return null;
  return {
    title,
    imageDataUri: image,
    ...(lang !== undefined ? { lang } : {}),
    ...(dir !== undefined ? { dir } : {}),
    source,
    servingsLabel,
    timeLabel,
    ingredients,
    instructions,
  };
}

/** The book in a request, checked field by field; null when anything is missing, the wrong shape, or too long. */
export function parsePdfBook(value: unknown): CookbookBook | null {
  if (!isObject(value)) return null;
  const title = text(value.title, PDF_LIMITS.shortText);
  const language = text(value.language, 35);
  const copy = isObject(value.copy) ? value.copy : null;
  const brand = text(copy?.brand, PDF_LIMITS.shortText);
  const recipeCount = text(copy?.recipeCount, PDF_LIMITS.shortText);
  const ingredientsHeading = text(copy?.ingredientsHeading, PDF_LIMITS.shortText);
  const stepsHeading = text(copy?.stepsHeading, PDF_LIMITS.shortText);
  const recipes = list(value.recipes, PDF_LIMITS.recipes, recipe);
  if (!title?.trim() || !language || !LANGUAGE_TAG.test(language) || typeof value.rtl !== "boolean") return null;
  if (value.pageSize !== "a4" && value.pageSize !== "letter") return null;
  if (value.hideImages !== undefined && typeof value.hideImages !== "boolean") return null;
  if (brand === null || recipeCount === null || ingredientsHeading === null || stepsHeading === null) return null;
  if (!recipes || recipes.length === 0) return null;
  return {
    title,
    recipes,
    language,
    rtl: value.rtl,
    pageSize: value.pageSize,
    copy: { brand, recipeCount, ingredientsHeading, stepsHeading },
    hideImages: value.hideImages === true,
  };
}

/** The same book with the photos that could not be loaded left out, so their pages show the placeholder. */
export function withoutPhotos(book: CookbookBook, missing: ReadonlySet<string>): CookbookBook {
  if (missing.size === 0) return book;
  return {
    ...book,
    recipes: book.recipes.map((entry) => (entry.imageDataUri && missing.has(entry.imageDataUri) ? { ...entry, imageDataUri: null } : entry)),
  };
}

/** Which recipes (by position in the book) print without their photo. */
export function missingPhotoIndexes(book: CookbookBook, missing: ReadonlySet<string>): number[] {
  if (book.hideImages) return [];
  return book.recipes.flatMap((entry, index) => (entry.imageDataUri && missing.has(entry.imageDataUri) ? [index] : []));
}
