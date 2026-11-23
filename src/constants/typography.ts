/**
 * Night Market type (PIN-177), the phone app's copy of the web app's fonts (web/app/globals.css).
 *
 * Two faces: `display` (Space Grotesk) for headings, big numbers and main buttons, `body` (Inter) for the rest.
 * Both are loaded at runtime in src/app/_layout.tsx (FONT_ASSETS in src/constants/fonts.ts), so they ship over the
 * air.
 *
 * Android needs one family name per weight (a custom font ignores `fontWeight`), so a face and a weight resolve to
 * one family such as `Inter_600SemiBold`. Neither face has Hebrew or Arabic letters, and Space Grotesk has no
 * Cyrillic: in Hebrew and Arabic the system font is used with `fontWeight`, and Russian display text is set in
 * Inter. Pure functions only: the hook that reads the app language is `useTypography()` in
 * src/hooks/useTypography.ts.
 */
import type { AppLanguageCode } from '@shared/lib/appLanguages';

export type FontFace = 'body' | 'display';
export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';

/** How the app language is written, which decides the font, the tracking and capitals. */
export type Script = 'latin' | 'cyrillic' | 'hebrew' | 'arabic';

/** The style a face and weight come to: a family name, or the system font with a weight. */
export type FontStyle = {
  fontFamily?: string;
  fontWeight?: '400' | '500' | '600' | '700';
};

/** The family names `useFonts` registers (the keys of FONT_ASSETS in src/constants/fonts.ts). */
export const FontFamily = {
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  spaceGroteskMedium: 'SpaceGrotesk_500Medium',
  spaceGroteskSemiBold: 'SpaceGrotesk_600SemiBold',
  spaceGroteskBold: 'SpaceGrotesk_700Bold',
} as const;

const INTER: Record<FontWeightName, string> = {
  regular: FontFamily.interRegular,
  medium: FontFamily.interMedium,
  semibold: FontFamily.interSemiBold,
  bold: FontFamily.interBold,
};

// Space Grotesk is loaded from 500 up; a "regular" display line uses 500, as the web's lightest display text does.
const SPACE_GROTESK: Record<FontWeightName, string> = {
  regular: FontFamily.spaceGroteskMedium,
  medium: FontFamily.spaceGroteskMedium,
  semibold: FontFamily.spaceGroteskSemiBold,
  bold: FontFamily.spaceGroteskBold,
};

const NUMERIC_WEIGHT: Record<FontWeightName, NonNullable<FontStyle['fontWeight']>> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export function scriptForLanguage(language: AppLanguageCode | null | undefined): Script {
  if (language === 'he') return 'hebrew';
  if (language === 'ar') return 'arabic';
  if (language === 'ru') return 'cyrillic';
  return 'latin';
}

/**
 * The font for a face and weight in the app language. Set it as the Text's whole font: don't add `fontWeight`
 * next to a family name, or Android fakes a bolder weight on top of it.
 */
export function fontFor(face: FontFace, weight: FontWeightName, language: AppLanguageCode | null | undefined): FontStyle {
  const script = scriptForLanguage(language);
  if (script === 'hebrew' || script === 'arabic') return { fontWeight: NUMERIC_WEIGHT[weight] };
  if (face === 'display' && script === 'latin') return { fontFamily: SPACE_GROTESK[weight] };
  return { fontFamily: INTER[weight] };
}

/**
 * Letter spacing in px for a tracking in em at a font size: `tracking(-0.015, 30, 'en')` is -0.45. Hebrew and
 * Arabic get none (it pulls Arabic letters apart and does nothing for Hebrew), as on the web.
 */
export function tracking(em: number, fontSize: number, language: AppLanguageCode | null | undefined): number {
  const script = scriptForLanguage(language);
  if (script === 'hebrew' || script === 'arabic') return 0;
  return Math.round(em * fontSize * 100) / 100;
}

/** Whether small-caps labels are set in capitals. Hebrew and Arabic have no capitals. */
export function usesCapitals(language: AppLanguageCode | null | undefined): boolean {
  const script = scriptForLanguage(language);
  return script === 'latin' || script === 'cyrillic';
}

/** Tracking of headings and big numbers ("a touch tighter than body text"). */
export const DISPLAY_TRACKING_EM = -0.015;
/** Tracking of small-caps labels (TileLabel). */
export const LABEL_TRACKING_EM = 0.06;
/** Tracking of badges (TileBadge). */
export const BADGE_TRACKING_EM = 0.08;

export type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'number';

type VariantSpec = {
  face: FontFace;
  weight: FontWeightName;
  fontSize: number;
  lineHeight: number;
  /** Tracking in em, applied only where the script takes it. */
  trackingEm: number;
  /** Set in capitals where the script has them. */
  caps?: boolean;
};

/**
 * The type scale. h1–h3 and number are display text; body, bodySmall and caption are Inter; label is the small caps
 * at the top of a tile. Hebrew and Arabic lines are given a little more height (see `variantStyle`).
 */
export const TEXT_VARIANTS: Record<TextVariant, VariantSpec> = {
  h1: { face: 'display', weight: 'bold', fontSize: 30, lineHeight: 34, trackingEm: DISPLAY_TRACKING_EM },
  h2: { face: 'display', weight: 'bold', fontSize: 23, lineHeight: 28, trackingEm: DISPLAY_TRACKING_EM },
  h3: { face: 'display', weight: 'bold', fontSize: 17, lineHeight: 22, trackingEm: DISPLAY_TRACKING_EM },
  body: { face: 'body', weight: 'regular', fontSize: 16, lineHeight: 24, trackingEm: 0 },
  bodySmall: { face: 'body', weight: 'regular', fontSize: 15, lineHeight: 22, trackingEm: 0 },
  caption: { face: 'body', weight: 'regular', fontSize: 13, lineHeight: 18, trackingEm: 0 },
  label: { face: 'body', weight: 'semibold', fontSize: 12, lineHeight: 16, trackingEm: LABEL_TRACKING_EM, caps: true },
  number: { face: 'display', weight: 'bold', fontSize: 52, lineHeight: 54, trackingEm: DISPLAY_TRACKING_EM },
};

export type VariantStyle = FontStyle & {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase';
};

/**
 * Everything a variant sets on a Text in the app language, with an optional weight override. The system fonts used
 * for Hebrew and Arabic sit taller than Inter, so their lines get about 10% more height.
 */
export function variantStyle(
  variant: TextVariant,
  language: AppLanguageCode | null | undefined,
  weight?: FontWeightName,
): VariantStyle {
  const spec = TEXT_VARIANTS[variant];
  const script = scriptForLanguage(language);
  const rtlScript = script === 'hebrew' || script === 'arabic';
  return {
    ...fontFor(spec.face, weight ?? spec.weight, language),
    fontSize: spec.fontSize,
    lineHeight: rtlScript ? Math.round(spec.lineHeight * 1.1) : spec.lineHeight,
    letterSpacing: tracking(spec.trackingEm, spec.fontSize, language),
    ...(spec.caps && usesCapitals(language) ? { textTransform: 'uppercase' as const } : null),
  };
}
