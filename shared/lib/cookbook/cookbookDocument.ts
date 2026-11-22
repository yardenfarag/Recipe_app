import type { TFunction } from 'i18next';

import { isRtlAppLanguage, type AppLanguageCode } from '../appLanguages';
import type { MeasurementSystem } from '../convertMeasurement';
import type { Platform, Recipe } from '../../types/recipe';
import {
  buildCookbookHtml,
  toCookbookHtmlRecipe,
  type CookbookBook,
  type CookbookHtmlCopy,
  type CookbookPageSize,
} from './buildCookbookHtml';

/** How each source is named under a recipe's title when it has no link. */
export function cookbookPlatformLabels(t: TFunction): Partial<Record<Platform, string>> {
  return {
    youtube: t('cookbook.platformYoutube'),
    instagram: t('cookbook.platformInstagram'),
    tiktok: t('cookbook.platformTiktok'),
    facebook: t('cookbook.platformFacebook'),
    web: t('cookbook.platformWeb'),
    photo: t('cookbook.platformPhoto'),
  };
}

/** The words printed in the book, in the app's language. */
export function cookbookCopy(t: TFunction, recipeCount: number): CookbookHtmlCopy {
  return {
    brand: t('cookbook.madeWith'),
    recipeCount:
      recipeCount === 1
        ? t('cookbook.recipeCountOne', { count: recipeCount })
        : t('cookbook.recipeCountOther', { count: recipeCount }),
    ingredientsHeading: t('cookbook.ingredients'),
    stepsHeading: t('cookbook.steps'),
  };
}

export type CookbookDocumentOptions = {
  title: string;
  recipes: Recipe[];
  images?: (string | null | undefined)[];
  language: AppLanguageCode;
  measurementSystem: MeasurementSystem;
  pageSize: CookbookPageSize;
  /** False leaves the photos out of the book. */
  includePhotos?: boolean;
  t: TFunction;
};

/**
 * The book's content, in the app's language and the reader's measurements: the cover, then one recipe per page, in
 * the order given. Plain data, so the web app can send it to its server to be made into a PDF there.
 *
 * `images` lines up with `recipes`: a `data:` URI, a URL the page can load, or nothing for the placeholder.
 */
export function buildCookbookBook(options: CookbookDocumentOptions): CookbookBook {
  const { t, language } = options;
  const platformLabels = cookbookPlatformLabels(t);
  const recipes = options.recipes.map((recipe, index) =>
    toCookbookHtmlRecipe(recipe, {
      language,
      measurementSystem: options.measurementSystem,
      imageDataUri: options.images?.[index] ?? null,
      servingsLabel: recipe.servings > 0 ? t('cookbook.servings', { count: recipe.servings }) : '',
      durationMin: t('recipe.durationMin'),
      durationHr: t('recipe.durationHr'),
      platformLabels,
    }),
  );
  return {
    title: options.title.trim(),
    recipes,
    language,
    rtl: isRtlAppLanguage(language),
    pageSize: options.pageSize,
    copy: cookbookCopy(t, recipes.length),
    hideImages: options.includePhotos === false,
  };
}

/**
 * The whole book as one HTML page. Both apps make the same book from the same recipes; only turning it into a PDF
 * differs (the phone's print service, the web app's server).
 */
export function buildCookbookDocument(options: CookbookDocumentOptions): string {
  return buildCookbookHtml(buildCookbookBook(options));
}
