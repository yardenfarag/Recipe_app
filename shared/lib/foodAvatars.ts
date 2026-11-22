/**
 * Food avatars: cute characters a cook can pick as their profile picture instead of uploading a photo.
 *
 * The choice is stored in `profiles.avatar_url` as `food:<id>` (no migration, and an uploaded photo is still a URL).
 * Each app draws the art from `foodAvatarSvg`: the web as an <img> data URI, the mobile app with react-native-svg.
 * The colours are the illustration's own, like a photo's, so they stay the same in every theme.
 */

export const FOOD_AVATAR_IDS = [
  'spaghetti',
  'pizza',
  'avocado',
  'egg',
  'sushi',
  'donut',
  'strawberry',
  'dumpling',
  'cupcake',
  'broccoli',
  'taco',
  'cookie',
] as const;

export type FoodAvatarId = (typeof FOOD_AVATAR_IDS)[number];

const PREFIX = 'food:';

/** What goes in `profiles.avatar_url` for a food avatar. */
export function foodAvatarValue(id: FoodAvatarId): string {
  return `${PREFIX}${id}`;
}

/** The food avatar an `avatar_url` names, or null for a photo URL, nothing, or an id this version doesn't know. */
export function foodAvatarIdFrom(avatarUrl: string | null | undefined): FoodAvatarId | null {
  if (!avatarUrl?.startsWith(PREFIX)) return null;
  const id = avatarUrl.slice(PREFIX.length);
  return (FOOD_AVATAR_IDS as readonly string[]).includes(id) ? (id as FoodAvatarId) : null;
}

/** True when `avatar_url` holds a food avatar (even one a newer version added), so it must not be loaded as a URL. */
export function isFoodAvatarValue(avatarUrl: string | null | undefined): boolean {
  return Boolean(avatarUrl?.startsWith(PREFIX));
}

const INK = '#3B2A2A';
const BLUSH = '#FF8FA3';

type Eyes = 'dot' | 'happy' | 'wink';
type Mouth = 'smile' | 'open' | 'cat';

function dotEye(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="3" ry="3.5" fill="${INK}"/><circle cx="${x - 0.9}" cy="${y - 1.3}" r="1.1" fill="#FFFFFF"/>`;
}

function happyEye(x: number, y: number): string {
  return `<path d="M${x - 3.2} ${y + 1.2}Q${x} ${y - 3.2} ${x + 3.2} ${y + 1.2}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
}

/** Two eyes `gap` either side of (x, y), a mouth `mouthDrop` below, and pink cheeks. */
function face(
  x: number,
  y: number,
  { eyes = 'dot', mouth = 'smile', gap = 8, mouthDrop = 5.5, blush = true }: {
    eyes?: Eyes;
    mouth?: Mouth;
    gap?: number;
    mouthDrop?: number;
    blush?: boolean;
  } = {},
): string {
  const left = x - gap;
  const right = x + gap;
  const eyeParts =
    eyes === 'happy'
      ? happyEye(left, y) + happyEye(right, y)
      : eyes === 'wink'
        ? dotEye(left, y) + happyEye(right, y)
        : dotEye(left, y) + dotEye(right, y);

  const m = y + mouthDrop;
  const stroke = `fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const mouthPart =
    mouth === 'open'
      ? `<path d="M${x - 4.2} ${m - 0.6}Q${x} ${m + 8} ${x + 4.2} ${m - 0.6}Z" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="${x}" cy="${m + 3.3}" rx="2.3" ry="1.5" fill="#FF7A8A"/>`
      : mouth === 'cat'
        ? `<path d="M${x - 4.4} ${m}Q${x - 2.2} ${m + 3.2} ${x} ${m}Q${x + 2.2} ${m + 3.2} ${x + 4.4} ${m}" ${stroke}/>`
        : `<path d="M${x - 3.6} ${m}Q${x} ${m + 3.8} ${x + 3.6} ${m}" ${stroke}/>`;

  const cheeks = blush
    ? `<ellipse cx="${left - 4}" cy="${y + 5}" rx="3.4" ry="2" fill="${BLUSH}" opacity="0.6"/><ellipse cx="${right + 4}" cy="${y + 5}" rx="3.4" ry="2" fill="${BLUSH}" opacity="0.6"/>`
    : '';
  return eyeParts + mouthPart + cheeks;
}

function sprinkle(x: number, y: number, angle: number, color: string): string {
  return `<rect x="-3" y="-1.1" width="6" height="2.2" rx="1.1" fill="${color}" transform="translate(${x} ${y}) rotate(${angle})"/>`;
}

/** Each avatar: its background and the drawing on a 100×100 grid. */
const ART: Record<FoodAvatarId, { background: string; body: string }> = {
  spaghetti: {
    background: '#FFDDB5',
    body:
      '<path d="M22 58C22 36 34 26 50 26C66 26 78 36 78 58Z" fill="#F7CF5E"/>' +
      '<path d="M27 54C33 42 41 52 47 40M40 57C46 45 55 55 61 42M56 57C62 47 67 52 73 45" fill="none" stroke="#E2AA2E" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M33 38C34 28 42 22 50 22C60 22 67 28 67 37C62 41 57 37 52 40C46 43 40 38 33 38Z" fill="#E5493A"/>' +
      '<circle cx="44" cy="30" r="6" fill="#9A5530"/><circle cx="42.5" cy="28" r="1.8" fill="#FFFFFF" opacity="0.35"/>' +
      '<circle cx="57" cy="28" r="5.5" fill="#8A4A28"/><circle cx="55.6" cy="26.2" r="1.6" fill="#FFFFFF" opacity="0.35"/>' +
      '<path d="M50 21C53 14 61 13 64 16C60 22 54 23 50 21Z" fill="#4CAF50"/>' +
      '<path d="M14 57H86C86 75 70 89 50 89C30 89 14 75 14 57Z" fill="#FFFFFF"/>' +
      '<rect x="12" y="53" width="76" height="7" rx="3.5" fill="#FFFFFF"/>' +
      '<path d="M30 84Q50 91 70 84" fill="none" stroke="#9CC8EC" stroke-width="3" stroke-linecap="round"/>' +
      face(50, 68, { mouth: 'open' }),
  },
  pizza: {
    background: '#CADDFF',
    body:
      '<path d="M17 26L83 26L53 88Q50 93 47 88Z" fill="#FFD45C"/>' +
      '<path d="M14 26Q50 12 86 26Q88 34 82 35Q50 22 18 35Q12 34 14 26Z" fill="#E09A48"/>' +
      '<circle cx="31" cy="40" r="5.5" fill="#DE4A3A"/><circle cx="69" cy="40" r="5.5" fill="#DE4A3A"/><circle cx="50" cy="75" r="4.5" fill="#DE4A3A"/>' +
      '<circle cx="29.5" cy="38.5" r="1.5" fill="#FFFFFF" opacity="0.35"/><circle cx="67.5" cy="38.5" r="1.5" fill="#FFFFFF" opacity="0.35"/>' +
      face(50, 51, { blush: false, mouthDrop: 11 }) +
      `<circle cx="42" cy="51" r="7.2" fill="#FFFFFF" fill-opacity="0.3" stroke="${INK}" stroke-width="2.2"/>` +
      `<circle cx="58" cy="51" r="7.2" fill="#FFFFFF" fill-opacity="0.3" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M49 49.5Q50 48.5 51 49.5" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  avocado: {
    background: '#FFD1DC',
    body:
      '<path d="M50 10C69 10 82 38 82 60C82 79 68 91 50 91C32 91 18 79 18 60C18 38 31 10 50 10Z" fill="#4F7D2C"/>' +
      '<path d="M50 16C65 16 76 40 76 60C76 75 65 85 50 85C35 85 24 75 24 60C24 40 35 16 50 16Z" fill="#D7EA8B"/>' +
      '<circle cx="50" cy="66" r="13" fill="#A0643A"/><circle cx="45" cy="61" r="3.5" fill="#FFFFFF" opacity="0.35"/>' +
      face(50, 40, { gap: 7 }),
  },
  egg: {
    background: '#E1F3B5',
    body:
      '<path d="M24 30C34 14 58 16 68 24C82 30 88 46 80 60C76 74 62 86 44 82C26 80 14 66 16 50C16 42 18 36 24 30Z" fill="#FFFFFF"/>' +
      '<circle cx="50" cy="52" r="20" fill="#FFB52E"/><circle cx="41" cy="41" r="3" fill="#FFFFFF" opacity="0.55"/>' +
      face(50, 51, { eyes: 'happy' }),
  },
  sushi: {
    background: '#C8EDE6',
    body:
      '<rect x="18" y="44" width="64" height="38" rx="17" fill="#FFFFFF"/>' +
      '<path d="M24 76Q50 83 76 76" fill="none" stroke="#E6E6E6" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M14 46C14 34 30 30 50 30C70 30 86 34 86 46C86 52 80 54 74 52C60 48 40 48 26 52C20 54 14 52 14 46Z" fill="#FF8A5B"/>' +
      '<path d="M30 35Q36 41 34 48M48 33Q54 39 52 46M66 34Q72 40 70 47" fill="none" stroke="#FFD3C0" stroke-width="3" stroke-linecap="round"/>' +
      face(50, 62, { mouth: 'cat' }),
  },
  donut: {
    background: '#FFF0B8',
    body:
      '<circle cx="50" cy="52" r="34" fill="#E3A55E"/>' +
      '<path d="M50 22C62 20 76 26 80 38C84 46 78 50 80 58C82 68 72 78 60 76C54 80 46 80 40 76C28 78 18 68 20 58C22 50 16 46 20 38C24 26 38 20 50 22Z" fill="#FF86AE"/>' +
      '<circle cx="50" cy="38" r="8.5" fill="#E3A55E"/><circle cx="50" cy="38" r="6" fill="#FFF0B8"/>' +
      sprinkle(33, 31, 30, '#FFFFFF') +
      sprinkle(66, 29, -20, '#6CC6E8') +
      sprinkle(73, 47, 60, '#FFD84D') +
      sprinkle(27, 47, -40, '#8EDB6A') +
      sprinkle(38, 72, 15, '#6CC6E8') +
      sprinkle(63, 72, -50, '#FFFFFF') +
      face(50, 56, { eyes: 'wink' }),
  },
  strawberry: {
    background: '#CDEFD0',
    body:
      '<path d="M50 90C32 84 17 64 18 46C19 32 32 26 50 28C68 26 81 32 82 46C83 64 68 84 50 90Z" fill="#F2474F"/>' +
      [
        [29, 42],
        [71, 42],
        [27, 61],
        [73, 61],
        [38, 76],
        [62, 76],
        [50, 84],
        [43, 35],
        [57, 35],
      ]
        .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.2" ry="1.8" fill="#FFE07A"/>`)
        .join('') +
      '<rect x="48.5" y="8" width="3" height="12" rx="1.5" fill="#3F8F3F"/>' +
      '<ellipse cx="40" cy="25" rx="10" ry="5" fill="#4FAE4E" transform="rotate(-25 40 25)"/>' +
      '<ellipse cx="60" cy="25" rx="10" ry="5" fill="#4FAE4E" transform="rotate(25 60 25)"/>' +
      '<ellipse cx="50" cy="24" rx="5" ry="8" fill="#5CBF5A"/>' +
      face(50, 52, { mouth: 'open' }),
  },
  dumpling: {
    background: '#C6E9F5',
    body:
      '<path d="M38 24Q34 19 38 14M50 22Q46 17 50 12M62 24Q58 19 62 14" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.9"/>' +
      '<path d="M14 68C14 44 30 32 50 32C70 32 86 44 86 68C86 76 80 80 72 80H28C20 80 14 76 14 68Z" fill="#FFF7EA"/>' +
      '<path d="M40 34Q44 40 42 46M50 32V44M60 34Q56 40 58 46" fill="none" stroke="#E8D2B5" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M20 74Q50 82 80 74" fill="none" stroke="#EAD7BD" stroke-width="2" stroke-linecap="round"/>' +
      face(50, 60, { eyes: 'happy', mouth: 'cat' }),
  },
  cupcake: {
    background: '#E8D6FF',
    body:
      '<path d="M26 56H74L67 88H33Z" fill="#3FB0BD"/>' +
      '<path d="M38 58L40 86M50 58V86M62 58L60 86" fill="none" stroke="#2E97A3" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M20 58C14 58 14 48 22 46C20 36 30 30 38 32C40 22 60 22 62 32C70 30 80 36 78 46C86 48 86 58 80 58Z" fill="#FFC1D4"/>' +
      '<path d="M50 15Q52 9 57 7" fill="none" stroke="#5B3A29" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="50" cy="21" r="6" fill="#E5384F"/><circle cx="48" cy="19" r="1.6" fill="#FFFFFF" opacity="0.5"/>' +
      sprinkle(28, 50, 30, '#6CC6E8') +
      sprinkle(72, 50, -30, '#FFD84D') +
      sprinkle(36, 34, -20, '#8EDB6A') +
      sprinkle(65, 35, 40, '#FFFFFF') +
      face(50, 43, { gap: 7 }),
  },
  broccoli: {
    background: '#FFD9CC',
    body:
      '<path d="M40 52H60L63 86Q50 92 37 86Z" fill="#A6D16A"/>' +
      '<circle cx="30" cy="44" r="14" fill="#3F9B4C"/><circle cx="70" cy="44" r="14" fill="#3F9B4C"/>' +
      '<circle cx="40" cy="28" r="14" fill="#3F9B4C"/><circle cx="60" cy="28" r="14" fill="#3F9B4C"/>' +
      '<circle cx="50" cy="44" r="18" fill="#3F9B4C"/>' +
      '<circle cx="24" cy="38" r="2.5" fill="#55B35F"/><circle cx="74" cy="36" r="2.5" fill="#55B35F"/>' +
      '<circle cx="44" cy="20" r="2.5" fill="#55B35F"/><circle cx="62" cy="21" r="2" fill="#55B35F"/>' +
      '<circle cx="29" cy="52" r="2" fill="#55B35F"/><circle cx="71" cy="53" r="2" fill="#55B35F"/>' +
      face(50, 40, { mouth: 'cat' }),
  },
  taco: {
    background: '#FFD3F0',
    body:
      '<path d="M16 64C14 50 22 38 30 36C32 28 42 24 50 28C58 24 68 28 70 36C78 38 86 50 84 64Z" fill="#7BC74D"/>' +
      '<circle cx="30" cy="38" r="5" fill="#E9473F"/><circle cx="62" cy="29" r="5" fill="#E9473F"/><circle cx="75" cy="44" r="5" fill="#E9473F"/>' +
      '<circle cx="44" cy="28" r="4" fill="#8A5230"/><circle cx="22" cy="49" r="4" fill="#8A5230"/><circle cx="54" cy="25" r="3.5" fill="#8A5230"/>' +
      '<path d="M12 76C12 52 30 40 50 40C70 40 88 52 88 76Z" fill="#F6C34B"/>' +
      '<circle cx="27" cy="62" r="2" fill="#E2A535"/><circle cx="73" cy="64" r="2" fill="#E2A535"/><circle cx="67" cy="51" r="1.6" fill="#E2A535"/><circle cx="33" cy="71" r="1.6" fill="#E2A535"/>' +
      face(50, 58, { eyes: 'happy', mouth: 'open' }),
  },
  cookie: {
    background: '#D7D4FF',
    body:
      '<circle cx="50" cy="52" r="34" fill="#DDA15E"/>' +
      '<circle cx="81" cy="25" r="13" fill="#D7D4FF"/>' +
      '<circle cx="66" cy="42" r="1.4" fill="#C98B48"/><circle cx="73" cy="37" r="1.2" fill="#C98B48"/>' +
      '<circle cx="34" cy="34" r="4" fill="#6B3E26"/><circle cx="55" cy="28" r="3.5" fill="#6B3E26"/>' +
      '<circle cx="26" cy="58" r="3.5" fill="#6B3E26"/><circle cx="74" cy="64" r="4" fill="#6B3E26"/>' +
      '<circle cx="42" cy="76" r="3.5" fill="#6B3E26"/><circle cx="60" cy="78" r="3" fill="#6B3E26"/>' +
      face(48, 54),
  },
};

/** The avatar's background colour, for a placeholder while it draws. */
export function foodAvatarBackground(id: FoodAvatarId): string {
  return ART[id].background;
}

/** A complete, square SVG document for the avatar. */
export function foodAvatarSvg(id: FoodAvatarId): string {
  const { background, body } = ART[id];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${background}"/>${body}</svg>`;
}

/** The SVG as a data URI, for an <img>. */
export function foodAvatarDataUri(id: FoodAvatarId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(foodAvatarSvg(id))}`;
}
