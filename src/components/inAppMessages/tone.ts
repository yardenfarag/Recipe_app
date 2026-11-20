import type { ThemePackColors } from '@shared/constants/themes';
import type { Tone } from '@shared/lib/inAppMessages';

export type ToneColors = {
  /** Icon, accent line and the filled button. */
  accent: string;
  /** Icon badge and banner background. */
  soft: string;
  /** Text on an `accent` fill. */
  onAccent: string;
};

export const TONE_ICONS: Record<Tone, string> = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
  critical: 'alert-circle',
};

/** Tone sets the icon and the accent colour, from the theme pack. */
export function toneColors(tone: Tone, colors: ThemePackColors): ToneColors {
  switch (tone) {
    case 'success':
      return { accent: colors.success, soft: colors.successSoft, onAccent: colors.background };
    case 'warning':
      return { accent: colors.warning, soft: colors.warningSoft, onAccent: colors.background };
    case 'critical':
      return { accent: colors.danger, soft: colors.dangerSoft, onAccent: colors.background };
    default:
      return { accent: colors.primary, soft: colors.primarySoft, onAccent: colors.onPrimary };
  }
}

/** The admin's icon name when the icon set has it, otherwise the tone's. */
export function resolveIconName(icon: string | undefined, tone: Tone, glyphs: object): string {
  return icon && icon in glyphs ? icon : TONE_ICONS[tone];
}
