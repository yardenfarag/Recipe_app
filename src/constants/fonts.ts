/**
 * The font files of Night Market (PIN-177), keyed by the family names in `FontFamily` (typography.ts). Loaded once
 * at runtime by the root layout with expo-font's `useFonts`, not by a config plugin, so they ship over the air.
 * Each weight is imported from its own folder so only these seven files are bundled, not the whole families.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';

import { FontFamily } from '@/constants/typography';

export const FONT_ASSETS = {
  [FontFamily.interRegular]: Inter_400Regular,
  [FontFamily.interMedium]: Inter_500Medium,
  [FontFamily.interSemiBold]: Inter_600SemiBold,
  [FontFamily.interBold]: Inter_700Bold,
  [FontFamily.spaceGroteskMedium]: SpaceGrotesk_500Medium,
  [FontFamily.spaceGroteskSemiBold]: SpaceGrotesk_600SemiBold,
  [FontFamily.spaceGroteskBold]: SpaceGrotesk_700Bold,
};
