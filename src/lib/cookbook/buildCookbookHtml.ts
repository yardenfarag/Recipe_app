import { displayIngredientAmount } from '@/lib/displayIngredientAmount';
import { formatRecipeDuration } from '@/lib/formatRecipeDuration';
import { resolveCulinaryLanguage } from '@/lib/culinaryUnits';
import type { MeasurementSystem } from '@/lib/convertMeasurement';
import type { Platform, Recipe } from '@/types/recipe';

export type CookbookPageSize = 'a4' | 'letter';

export const COOKBOOK_PAGE_PX = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
} as const;

export type CookbookHtmlRecipe = {
  title: string;
  imageDataUri?: string | null;
  source: string;
  servingsLabel: string;
  timeLabel: string;
  ingredients: { amount: string; name: string }[];
  instructions: { step: number; text: string }[];
};

export type CookbookHtmlCopy = {
  brand: string;
  recipeCount: string;
  ingredientsHeading: string;
  stepsHeading: string;
};

const COOKIE_SVG = `<svg class="cookie" viewBox="0 0 24 24" aria-hidden="true"><path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12C21,11.5 20.96,11 20.87,10.5C20.6,10 20,10 20,10H18V9C18,8 17,8 17,8H15V7C15,6 14,6 14,6H13V4C13,3 12,3 12,3Z" fill="#7B6B9A"/><circle cx="9.5" cy="7.5" r="1.5" fill="#FFFFFF" fill-opacity="0.55"/><circle cx="6.5" cy="11.5" r="1.5" fill="#FFFFFF" fill-opacity="0.45"/><circle cx="11.5" cy="12.5" r="1.5" fill="#FFFFFF" fill-opacity="0.5"/><circle cx="16.5" cy="14.5" r="1.5" fill="#FFFFFF" fill-opacity="0.4"/><circle cx="11" cy="17.5" r="1.5" fill="#FFFFFF" fill-opacity="0.45"/></svg>`;

const PLACEHOLDER_SVG = `<svg class="placeholder-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#7B6B9A" d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>`;

const FONT_STACK =
  '"Roboto", "Noto Sans Hebrew", "Noto Sans Arabic", "Noto Sans", sans-serif';

const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&family=Noto+Sans+Hebrew:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap';

export function cookbookFileName(title: string): string {
  const slug = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'cookbook'}.pdf`;
}

/** US Letter only for en-US; everyone else gets A4. */
export function cookbookPageSizeForLocale(localeTag: string | null | undefined): CookbookPageSize {
  const tag = localeTag?.trim().toLowerCase().replace('_', '-') ?? '';
  return tag === 'en-us' || tag.endsWith('-us') ? 'letter' : 'a4';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function cookbookSourceLabel(
  originalUrl: string | undefined,
  platform: Platform | undefined,
  platformLabels: Partial<Record<Platform, string>>,
): string {
  const url = originalUrl?.trim();
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      return url;
    }
  }
  if (platform && platform !== 'unknown') {
    return platformLabels[platform] ?? '';
  }
  return '';
}

export function toCookbookHtmlRecipe(
  recipe: Recipe,
  options: {
    language: string;
    measurementSystem: MeasurementSystem;
    imageDataUri?: string | null;
    servingsLabel: string;
    durationMin: string;
    durationHr: string;
    platformLabels: Partial<Record<Platform, string>>;
  },
): CookbookHtmlRecipe {
  const translation = recipe.translations?.[options.language];
  const title =
    recipe.display_title?.trim() || translation?.title?.trim() || recipe.title;
  const ingredients =
    translation?.ingredients?.length ? translation.ingredients : recipe.ingredients;
  const instructions =
    translation?.instructions?.length ? translation.instructions : recipe.instructions;
  const culinary = resolveCulinaryLanguage(options.language);

  return {
    title,
    imageDataUri: options.imageDataUri,
    source: cookbookSourceLabel(recipe.original_url, recipe.platform, options.platformLabels),
    servingsLabel: options.servingsLabel,
    timeLabel: formatRecipeDuration(recipe.estimated_time_minutes ?? 0, {
      minutes: options.durationMin,
      hours: options.durationHr,
    }),
    ingredients: ingredients.map((ingredient) => ({
      amount: displayIngredientAmount(ingredient, {
        system: options.measurementSystem,
        language: culinary,
      }),
      name: ingredient.name,
    })),
    instructions: instructions.map((step, index) => ({
      step: step.step || index + 1,
      text: step.text,
    })),
  };
}

export function buildCookbookHtml(options: {
  title: string;
  recipes: CookbookHtmlRecipe[];
  language: string;
  rtl: boolean;
  pageSize: CookbookPageSize;
  copy: CookbookHtmlCopy;
}): string {
  const dir = options.rtl ? 'rtl' : 'ltr';
  const pageCss = options.pageSize === 'letter' ? 'letter' : 'A4';
  const recipePages = options.recipes.map((recipe, index) => renderRecipePage(recipe, index, options.copy)).join('');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.language)}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONT_STYLESHEET}" />
<style>
  @page { size: ${pageCss}; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #F4F1F8;
    color: #2A2634;
    font-family: ${FONT_STACK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cover {
    position: relative;
    overflow: hidden;
    min-height: 100vh;
    padding: 48px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: linear-gradient(165deg, #F4F1F8 0%, #EBF0F5 48%, #F7F5FA 100%);
    page-break-after: always;
    break-after: page;
  }
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(8px);
    opacity: 0.85;
  }
  .orb-a { width: 280px; height: 280px; background: #DDD4EC; top: -60px; inset-inline-start: -80px; }
  .orb-b { width: 220px; height: 220px; background: #D2DEEA; bottom: 8%; inset-inline-end: -70px; }
  .orb-c { width: 160px; height: 160px; background: #E8E0F0; bottom: 22%; inset-inline-start: 12%; }
  .cover-inner { position: relative; z-index: 1; max-width: 78%; }
  .cookie { width: 56px; height: 56px; display: block; margin: 0 auto 16px; }
  .brand {
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 500;
    color: #6E6878;
    margin: 0 0 20px;
  }
  .cover-title {
    margin: 0 0 16px;
    font-size: 44px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #2A2634;
  }
  .cover-count { margin: 0; font-size: 16px; font-weight: 400; color: #6E6878; }
  .recipe {
    page-break-before: always;
    break-before: page;
    padding: 32px 36px 40px;
    min-height: 100vh;
    background: #FBF9FC;
  }
  .hero {
    display: block;
    width: 100%;
    height: 220px;
    object-fit: cover;
    border-radius: 18px;
    margin: 0 0 18px;
    background: #E8E2F0;
  }
  .hero-fallback {
    width: 100%;
    height: 160px;
    border-radius: 18px;
    margin: 0 0 18px;
    background: #E8E2F0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .placeholder-icon { width: 40px; height: 40px; }
  .recipe-title {
    margin: 0 0 8px;
    font-size: 26px;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2A2634;
  }
  .source, .meta {
    font-size: 12px;
    font-weight: 400;
    color: #6E6878;
    margin: 0 0 6px;
  }
  .meta { margin-bottom: 18px; }
  .columns { display: flex; gap: 28px; align-items: flex-start; }
  .col-ingredients { width: 38%; }
  .col-steps { width: 62%; }
  h2 {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7B6B9A;
    margin: 0 0 10px;
  }
  ul, ol { margin: 0; padding: 0; list-style: none; }
  .row {
    page-break-inside: avoid;
    break-inside: avoid;
    padding: 5px 0;
    font-size: 14px;
    line-height: 1.5;
  }
  .amount {
    color: #7B6B9A;
    font-weight: 500;
    margin-inline-end: 6px;
  }
  .step-num {
    color: #7B6B9A;
    font-weight: 700;
    margin-inline-end: 8px;
  }
  @media print {
    .cover, .recipe { min-height: 100vh; }
  }
</style>
</head>
<body>
  <section class="cover" data-cookbook-page="cover">
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div class="orb orb-c"></div>
    <div class="cover-inner">
      ${COOKIE_SVG}
      <p class="brand">${escapeHtml(options.copy.brand)}</p>
      <h1 class="cover-title">${escapeHtml(options.title)}</h1>
      <p class="cover-count">${escapeHtml(options.copy.recipeCount)}</p>
    </div>
  </section>
  ${recipePages}
</body>
</html>`;
}

function renderRecipePage(recipe: CookbookHtmlRecipe, index: number, copy: CookbookHtmlCopy): string {
  const image = recipe.imageDataUri
    ? `<img class="hero" src="${recipe.imageDataUri}" alt="" />`
    : `<div class="hero-fallback" data-cookbook-fallback="image">${PLACEHOLDER_SVG}</div>`;
  const source = recipe.source
    ? `<p class="source">${escapeHtml(recipe.source)}</p>`
    : '';
  const metaBits = [recipe.servingsLabel, recipe.timeLabel].filter(Boolean);
  const meta = metaBits.length
    ? `<p class="meta">${escapeHtml(metaBits.join(' · '))}</p>`
    : '';
  const ingredients = recipe.ingredients
    .map((item) => {
      const amount = item.amount.trim()
        ? `<span class="amount">${escapeHtml(item.amount)}</span>`
        : '';
      return `<li class="row">${amount}${escapeHtml(item.name)}</li>`;
    })
    .join('');
  const steps = recipe.instructions
    .map(
      (step) =>
        `<li class="row"><span class="step-num">${step.step}.</span>${escapeHtml(step.text)}</li>`,
    )
    .join('');

  return `<section class="recipe" data-cookbook-page="recipe" data-recipe-index="${index}">
    ${image}
    <h1 class="recipe-title">${escapeHtml(recipe.title)}</h1>
    ${source}
    ${meta}
    <div class="columns">
      <div class="col-ingredients">
        <h2>${escapeHtml(copy.ingredientsHeading)}</h2>
        <ul>${ingredients}</ul>
      </div>
      <div class="col-steps">
        <h2>${escapeHtml(copy.stepsHeading)}</h2>
        <ol>${steps}</ol>
      </div>
    </div>
  </section>`;
}
