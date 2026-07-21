/**
 * Theme packs — Drift family. Light/dark are modes within a pack.
 * NativeWind `pinch-*` classes stay Mist-aligned; live UI should prefer
 * `useThemePreference().colors` so packs actually paint the screen.
 */

export type ThemePackId =
  | 'mist'
  | 'fruity'
  | 'cat'
  | 'potter'
  | 'dracula'
  | 'sunny'
  | 'starry';

export type ThemePackColors = {
  text: string;
  textSecondary: string;
  background: string;
  surface: string;
  surfaceSoft: string;
  backgroundElement: string;
  backgroundSelected: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  border: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  tabBar: string;
  overlay: string;
  mistGradient: [string, string, string];
  mistOrbA: string;
  mistOrbB: string;
  mistOrbC: string;
  frosted: string;
  frostedBorder: string;
};

export type ThemePack = {
  id: ThemePackId;
  name: string;
  /** One-line vibe for the picker. */
  blurb: string;
  /** Three swatch dots shown in Settings. */
  swatches: [string, string, string];
  light: ThemePackColors;
  dark: ThemePackColors;
};

const sharedLightDanger = {
  danger: '#C45C5C',
  dangerSoft: '#FCE8E8',
  warning: '#B8860B',
  warningSoft: '#FBF3D9',
} as const;

const sharedDarkDanger = {
  danger: '#E88A8A',
  dangerSoft: '#3A2424',
  warning: '#E8C96A',
  warningSoft: '#3A3420',
} as const;

const sharedLightSuccess = {
  success: '#3D8F6A',
  successSoft: '#E3F5EC',
} as const;

const sharedDarkSuccess = {
  success: '#6BC49A',
  successSoft: '#1E3228',
} as const;

export const ThemePacks: Record<ThemePackId, ThemePack> = {
  mist: {
    id: 'mist',
    name: 'Mist Drift',
    blurb: 'Soft lilac-slate calm — drifting mist.',
    swatches: ['#7B6B9A', '#6B849E', '#E8E2F0'],
    light: {
      text: '#2A2634',
      textSecondary: '#6E6878',
      background: '#F4F1F8',
      surface: '#FFFFFF',
      surfaceSoft: '#E8E2F0',
      backgroundElement: '#E8E2F0',
      backgroundSelected: '#D4C8E4',
      primary: '#7B6B9A',
      primarySoft: '#E8E2F0',
      accent: '#6B849E',
      accentSoft: '#E0E8F0',
      border: '#E2DCE8',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,255,255,0.88)',
      overlay: 'rgba(42, 38, 52, 0.45)',
      mistGradient: ['#F4F1F8', '#EBF0F5', '#F7F5FA'],
      mistOrbA: '#DDD4EC',
      mistOrbB: '#D2DEEA',
      mistOrbC: '#E8E0F0',
      frosted: 'rgba(255,255,255,0.72)',
      frostedBorder: 'rgba(120,110,140,0.1)',
    },
    dark: {
      text: '#F2F0F6',
      textSecondary: '#A49AB0',
      background: '#12101A',
      surface: '#1E1A28',
      surfaceSoft: '#2E2838',
      backgroundElement: '#2E2838',
      backgroundSelected: '#4A4058',
      primary: '#B8A8D4',
      primarySoft: '#2E2838',
      accent: '#9BB4D0',
      accentSoft: '#243040',
      border: '#3A3448',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(26, 22, 36, 0.92)',
      overlay: 'rgba(0, 0, 0, 0.55)',
      mistGradient: ['#1A1624', '#12101A', '#101218'],
      mistOrbA: '#352848',
      mistOrbB: '#243848',
      mistOrbC: '#2C2438',
      frosted: 'rgba(40, 36, 48, 0.72)',
      frostedBorder: 'rgba(160,150,180,0.12)',
    },
  },

  fruity: {
    id: 'fruity',
    name: 'Fruity Drift',
    blurb: 'Berry crush with floating fruit & bubbles.',
    swatches: ['#C45B8A', '#9B5B9A', '#F8DCE8'],
    light: {
      text: '#3A2430',
      textSecondary: '#7A5A68',
      background: '#FBF2F6',
      surface: '#FFFFFF',
      surfaceSoft: '#F8DCE8',
      backgroundElement: '#F8DCE8',
      backgroundSelected: '#F0C4D6',
      primary: '#C45B8A',
      primarySoft: '#F8DCE8',
      accent: '#9B5B9A',
      accentSoft: '#F0E0F0',
      border: '#EED8E4',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,252,254,0.9)',
      overlay: 'rgba(58, 36, 48, 0.45)',
      mistGradient: ['#FBF2F6', '#F8E8F0', '#FFF5F8'],
      mistOrbA: '#F5C8DC',
      mistOrbB: '#E8C8E8',
      mistOrbC: '#F8D8E8',
      frosted: 'rgba(255,255,255,0.75)',
      frostedBorder: 'rgba(160,90,120,0.12)',
    },
    dark: {
      text: '#F8ECF2',
      textSecondary: '#C4A0B0',
      background: '#1A1016',
      surface: '#281820',
      surfaceSoft: '#3A2430',
      backgroundElement: '#3A2430',
      backgroundSelected: '#5A3450',
      primary: '#E890B4',
      primarySoft: '#3A2430',
      accent: '#D0A0D0',
      accentSoft: '#342438',
      border: '#4A3040',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(32, 20, 28, 0.94)',
      overlay: 'rgba(0, 0, 0, 0.55)',
      mistGradient: ['#241018', '#1A1016', '#1C1218'],
      mistOrbA: '#4A2838',
      mistOrbB: '#3A2840',
      mistOrbC: '#402830',
      frosted: 'rgba(48, 28, 38, 0.75)',
      frostedBorder: 'rgba(220,150,180,0.14)',
    },
  },

  cat: {
    id: 'cat',
    name: 'Cat Drift',
    blurb: 'Cream fur vibes — soft paws & twitching ears.',
    swatches: ['#B07A6A', '#8A7A72', '#F2E6DC'],
    light: {
      text: '#3A322C',
      textSecondary: '#7A6E66',
      background: '#F7F2EC',
      surface: '#FFFCFA',
      surfaceSoft: '#F2E6DC',
      backgroundElement: '#F2E6DC',
      backgroundSelected: '#E8D4C8',
      primary: '#B07A6A',
      primarySoft: '#F2E6DC',
      accent: '#8A7A72',
      accentSoft: '#EBE4DE',
      border: '#E4D8CE',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,252,250,0.9)',
      overlay: 'rgba(58, 50, 44, 0.45)',
      mistGradient: ['#F7F2EC', '#F0E8E0', '#FAF6F2'],
      mistOrbA: '#E8D4C4',
      mistOrbB: '#DCC8C0',
      mistOrbC: '#F0E0D4',
      frosted: 'rgba(255,252,250,0.78)',
      frostedBorder: 'rgba(140,110,100,0.12)',
    },
    dark: {
      text: '#F4ECE6',
      textSecondary: '#B8A89E',
      background: '#161210',
      surface: '#221C18',
      surfaceSoft: '#322820',
      backgroundElement: '#322820',
      backgroundSelected: '#4A3C34',
      primary: '#D4A090',
      primarySoft: '#322820',
      accent: '#B8A89E',
      accentSoft: '#2C2620',
      border: '#3E342C',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(28, 22, 18, 0.94)',
      overlay: 'rgba(0, 0, 0, 0.55)',
      mistGradient: ['#1C1612', '#161210', '#181412'],
      mistOrbA: '#3A2C24',
      mistOrbB: '#322820',
      mistOrbC: '#2E2420',
      frosted: 'rgba(40, 32, 28, 0.75)',
      frostedBorder: 'rgba(200,160,140,0.14)',
    },
  },

  potter: {
    id: 'potter',
    name: 'Potter Drift',
    blurb: 'Parchment glow — floating candles & sparks.',
    swatches: ['#8B3A4A', '#C4A35A', '#F3E8D4'],
    light: {
      text: '#2E2418',
      textSecondary: '#6E5A48',
      background: '#F3E8D4',
      surface: '#FFF8EC',
      surfaceSoft: '#EAD8B8',
      backgroundElement: '#EAD8B8',
      backgroundSelected: '#DCC8A0',
      primary: '#8B3A4A',
      primarySoft: '#EAD0D4',
      accent: '#A88B3A',
      accentSoft: '#F0E4C0',
      border: '#E0D0B4',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,248,236,0.92)',
      overlay: 'rgba(46, 36, 24, 0.45)',
      mistGradient: ['#F3E8D4', '#EDE0C8', '#F8F0E0'],
      mistOrbA: '#E0C8A0',
      mistOrbB: '#D4B090',
      mistOrbC: '#E8D4B8',
      frosted: 'rgba(255,248,236,0.78)',
      frostedBorder: 'rgba(120,80,60,0.12)',
    },
    dark: {
      text: '#F0E4D0',
      textSecondary: '#B8A080',
      background: '#140E10',
      surface: '#1E1418',
      surfaceSoft: '#3A2028',
      backgroundElement: '#3A2028',
      backgroundSelected: '#5A3040',
      primary: '#D07080',
      primarySoft: '#3A2028',
      accent: '#D4B86A',
      accentSoft: '#2E2818',
      border: '#3E2830',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(24, 16, 20, 0.94)',
      overlay: 'rgba(0, 0, 0, 0.6)',
      mistGradient: ['#1C1014', '#140E10', '#181012'],
      mistOrbA: '#3A1820',
      mistOrbB: '#2E2410',
      mistOrbC: '#322018',
      frosted: 'rgba(36, 24, 28, 0.78)',
      frostedBorder: 'rgba(200,140,120,0.14)',
    },
  },

  dracula: {
    id: 'dracula',
    name: 'Dracula Drift',
    blurb: 'Midnight velvet — soft bats under the moon.',
    swatches: ['#9B2D4A', '#6B5B8A', '#1A1220'],
    light: {
      text: '#2A1830',
      textSecondary: '#6E5878',
      background: '#F4EEF4',
      surface: '#FFFFFF',
      surfaceSoft: '#E8D8E8',
      backgroundElement: '#E8D8E8',
      backgroundSelected: '#D8C0D8',
      primary: '#9B2D4A',
      primarySoft: '#F0D4DC',
      accent: '#6B5B8A',
      accentSoft: '#E4DCEC',
      border: '#E0D4E0',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,255,255,0.9)',
      overlay: 'rgba(42, 24, 48, 0.45)',
      mistGradient: ['#F4EEF4', '#ECE4F0', '#F8F2F6'],
      mistOrbA: '#E0C8D4',
      mistOrbB: '#D0C4E0',
      mistOrbC: '#E8D0DC',
      frosted: 'rgba(255,255,255,0.74)',
      frostedBorder: 'rgba(120,60,90,0.12)',
    },
    dark: {
      text: '#F0E8F0',
      textSecondary: '#A898B0',
      background: '#0E0A14',
      surface: '#1A1220',
      surfaceSoft: '#2E1830',
      backgroundElement: '#2E1830',
      backgroundSelected: '#4A2848',
      primary: '#E06080',
      primarySoft: '#2E1830',
      accent: '#A898D0',
      accentSoft: '#242038',
      border: '#3A2840',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(18, 12, 28, 0.95)',
      overlay: 'rgba(0, 0, 0, 0.65)',
      mistGradient: ['#160E1C', '#0E0A14', '#120C18'],
      mistOrbA: '#3A1828',
      mistOrbB: '#281838',
      mistOrbC: '#301828',
      frosted: 'rgba(32, 22, 40, 0.78)',
      frostedBorder: 'rgba(200,100,140,0.16)',
    },
  },

  sunny: {
    id: 'sunny',
    name: 'Sunny Drift',
    blurb: 'Warm honey light with gentle sunbeams.',
    swatches: ['#C49A4A', '#D4A88A', '#FBF4E8'],
    light: {
      text: '#3A3020',
      textSecondary: '#7A6A50',
      background: '#FBF4E8',
      surface: '#FFFCF6',
      surfaceSoft: '#F5E6C8',
      backgroundElement: '#F5E6C8',
      backgroundSelected: '#ECD8A8',
      primary: '#C49A4A',
      primarySoft: '#F5E6C8',
      accent: '#D4A88A',
      accentSoft: '#F8E8DC',
      border: '#ECDCC0',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,252,246,0.92)',
      overlay: 'rgba(58, 48, 32, 0.4)',
      mistGradient: ['#FBF4E8', '#F5ECD8', '#FFF8F0'],
      mistOrbA: '#F0D8A0',
      mistOrbB: '#F0D0B8',
      mistOrbC: '#F5E4C0',
      frosted: 'rgba(255,252,246,0.78)',
      frostedBorder: 'rgba(160,120,60,0.12)',
    },
    dark: {
      text: '#F8F0E0',
      textSecondary: '#C4B090',
      background: '#16120C',
      surface: '#221C14',
      surfaceSoft: '#3A3020',
      backgroundElement: '#3A3020',
      backgroundSelected: '#5A4830',
      primary: '#E0C070',
      primarySoft: '#3A3020',
      accent: '#E0B898',
      accentSoft: '#302820',
      border: '#403828',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(28, 22, 16, 0.94)',
      overlay: 'rgba(0, 0, 0, 0.55)',
      mistGradient: ['#1C1610', '#16120C', '#1A1410'],
      mistOrbA: '#3A3018',
      mistOrbB: '#3A2820',
      mistOrbC: '#322818',
      frosted: 'rgba(40, 34, 24, 0.75)',
      frostedBorder: 'rgba(220,180,100,0.14)',
    },
  },

  starry: {
    id: 'starry',
    name: 'Starry Night Drift',
    blurb: 'Indigo sky — twinkles & shooting stars.',
    swatches: ['#4A6AA8', '#C4B060', '#1A2038'],
    light: {
      text: '#1E2838',
      textSecondary: '#5A6880',
      background: '#EEF2F8',
      surface: '#FFFFFF',
      surfaceSoft: '#DCE4F0',
      backgroundElement: '#DCE4F0',
      backgroundSelected: '#C8D4E8',
      primary: '#4A6AA8',
      primarySoft: '#DCE4F0',
      accent: '#A89440',
      accentSoft: '#F0E8C8',
      border: '#D4DCE8',
            ...sharedLightDanger,
      ...sharedLightSuccess,
      tabBar: 'rgba(255,255,255,0.9)',
      overlay: 'rgba(30, 40, 56, 0.45)',
      mistGradient: ['#EEF2F8', '#E4EAF4', '#F4F6FA'],
      mistOrbA: '#C8D4E8',
      mistOrbB: '#E0D8B0',
      mistOrbC: '#D0DCEC',
      frosted: 'rgba(255,255,255,0.74)',
      frostedBorder: 'rgba(70,100,150,0.12)',
    },
    dark: {
      text: '#E8ECF4',
      textSecondary: '#98A4C0',
      background: '#0C101C',
      surface: '#141A2C',
      surfaceSoft: '#1E2840',
      backgroundElement: '#1E2840',
      backgroundSelected: '#2E3C5A',
      primary: '#7A9AD0',
      primarySoft: '#1E2840',
      accent: '#E0D070',
      accentSoft: '#2E2A18',
      border: '#283048',
            ...sharedDarkDanger,
      ...sharedDarkSuccess,
      tabBar: 'rgba(16, 20, 36, 0.95)',
      overlay: 'rgba(0, 0, 0, 0.6)',
      mistGradient: ['#121828', '#0C101C', '#101420'],
      mistOrbA: '#1E2C48',
      mistOrbB: '#2E2A14',
      mistOrbC: '#182038',
      frosted: 'rgba(24, 30, 48, 0.78)',
      frostedBorder: 'rgba(120,150,200,0.16)',
    },
  },
};

export const THEME_PACK_ORDER: ThemePackId[] = [
  'mist',
  'fruity',
  'cat',
  'potter',
  'dracula',
  'sunny',
  'starry',
];

export const DEFAULT_THEME_PACK: ThemePackId = 'mist';

export function isThemePackId(value: string | null | undefined): value is ThemePackId {
  return value != null && value in ThemePacks;
}

export function getThemePackColors(
  packId: ThemePackId,
  scheme: 'light' | 'dark',
): ThemePackColors {
  return ThemePacks[packId][scheme];
}
