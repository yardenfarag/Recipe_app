import { useMemo } from 'react';

import {
  fontFor,
  scriptForLanguage,
  tracking,
  usesCapitals,
  variantStyle,
  type FontFace,
  type FontWeightName,
  type TextVariant,
} from '@/constants/typography';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { isRtlAppLanguage } from '@shared/lib/appLanguages';

/**
 * Night Market type in the app language (PIN-177). Prefer the kit's `<Text variant>` (src/components/ui/Text.tsx);
 * use this when styling a Text the kit doesn't cover, such as a TextInput:
 *
 *   const type = useTypography();
 *   <TextInput style={[type.font('body', 'medium'), { fontSize: 16 }]} />
 */
export function useTypography() {
  const { language } = useLanguagePreference();
  return useMemo(
    () => ({
      language,
      script: scriptForLanguage(language),
      rtl: isRtlAppLanguage(language),
      /** Whether small-caps labels are set in capitals. */
      caps: usesCapitals(language),
      /** `{ fontFamily }`, or `{ fontWeight }` with the system font in Hebrew and Arabic. */
      font: (face: FontFace, weight: FontWeightName) => fontFor(face, weight, language),
      /** Letter spacing in px for a tracking in em; 0 in Hebrew and Arabic. */
      tracking: (em: number, fontSize: number) => tracking(em, fontSize, language),
      /** Font, size, line height, tracking and capitals of a kit variant. */
      variant: (name: TextVariant, weight?: FontWeightName) => variantStyle(name, language, weight),
    }),
    [language],
  );
}
