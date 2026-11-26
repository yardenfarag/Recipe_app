/**
 * Household pictures: cosy dishes a household can pick as its picture (docs/adr/034-households.md).
 *
 * Stored in `households.avatar` as `house:<id>`. Each app draws the art from `householdAvatarSvg`: the web as an
 * <img> data URI, the mobile app with react-native-svg. The colours are the illustration's own, like a photo's,
 * so they stay the same in every theme.
 *
 * They are a different family from the personal food avatars (foodAvatars.ts) on purpose: the SVG itself is a
 * rounded square with a little house behind the dish, where a person's avatar is a full square the apps crop to
 * a circle. Draw these as they are (no circle crop), so a household never looks like a person.
 */

export const HOUSEHOLD_AVATAR_IDS = [
  'soup',
  'picnic',
  'challah',
  'teapot',
  'pie',
  'cheese',
  'honey',
  'bread',
  'tagine',
  'cake',
  'salad',
  'pancakes',
] as const;

export type HouseholdAvatarId = (typeof HOUSEHOLD_AVATAR_IDS)[number];

const PREFIX = 'house:';

/** What goes in `households.avatar` for a picture. */
export function householdAvatarValue(id: HouseholdAvatarId): string {
  return `${PREFIX}${id}`;
}

/** The picture a stored value names, or null for nothing or an id this version doesn't know. */
export function householdAvatarIdFrom(value: string | null | undefined): HouseholdAvatarId | null {
  if (!value?.startsWith(PREFIX)) return null;
  const id = value.slice(PREFIX.length);
  return (HOUSEHOLD_AVATAR_IDS as readonly string[]).includes(id) ? (id as HouseholdAvatarId) : null;
}

/** True when the value is a household picture (even one a newer version added). */
export function isHouseholdAvatarValue(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX));
}

/**
 * A picture to start the set-up form with, the same every time for the same seed (a household or user id),
 * so the form doesn't jump between visits.
 */
export function suggestHouseholdAvatar(seed: string): HouseholdAvatarId {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return HOUSEHOLD_AVATAR_IDS[hash % HOUSEHOLD_AVATAR_IDS.length];
}

const INK = '#3B2A2A';
const BLUSH = '#FF8FA3';

type Eyes = 'dot' | 'happy' | 'wink';
type Mouth = 'smile' | 'open' | 'cat';

function dotEye(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y}" rx="2.8" ry="3.2" fill="${INK}"/><circle cx="${x - 0.8}" cy="${y - 1.2}" r="1" fill="#FFFFFF"/>`;
}

function happyEye(x: number, y: number): string {
  return `<path d="M${x - 3} ${y + 1.1}Q${x} ${y - 3} ${x + 3} ${y + 1.1}" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round"/>`;
}

/** Two eyes `gap` either side of (x, y), a mouth `mouthDrop` below, and pink cheeks. */
function face(
  x: number,
  y: number,
  { eyes = 'dot', mouth = 'smile', gap = 7, mouthDrop = 5, blush = true }: {
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
  const stroke = `fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const mouthPart =
    mouth === 'open'
      ? `<path d="M${x - 3.8} ${m - 0.5}Q${x} ${m + 7} ${x + 3.8} ${m - 0.5}Z" fill="${INK}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/><ellipse cx="${x}" cy="${m + 2.9}" rx="2" ry="1.3" fill="#FF7A8A"/>`
      : mouth === 'cat'
        ? `<path d="M${x - 4} ${m}Q${x - 2} ${m + 2.9} ${x} ${m}Q${x + 2} ${m + 2.9} ${x + 4} ${m}" ${stroke}/>`
        : `<path d="M${x - 3.3} ${m}Q${x} ${m + 3.4} ${x + 3.3} ${m}" ${stroke}/>`;

  const cheeks = blush
    ? `<ellipse cx="${left - 3.6}" cy="${y + 4.6}" rx="3" ry="1.8" fill="${BLUSH}" opacity="0.6"/><ellipse cx="${right + 3.6}" cy="${y + 4.6}" rx="3" ry="1.8" fill="${BLUSH}" opacity="0.6"/>`
    : '';
  return eyeParts + mouthPart + cheeks;
}

function steam(xs: number[], top: number, color = '#FFFFFF'): string {
  return xs
    .map(
      (x) =>
        `<path d="M${x} ${top + 12}Q${x - 4} ${top + 8} ${x} ${top + 5}Q${x + 4} ${top + 2} ${x} ${top - 2}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`,
    )
    .join('');
}

/** The little house every household picture sits in front of: a pale roof-and-walls shape with a chimney. */
const HOUSE =
  '<rect x="66" y="16" width="9" height="16" rx="2" fill="#FFFFFF" opacity="0.55"/>' +
  '<path d="M50 13L87 42V83Q87 89 81 89H19Q13 89 13 83V42Z" fill="#FFFFFF" opacity="0.55" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>';

/** Each picture: its background and the dish on a 100×100 grid. */
const ART: Record<HouseholdAvatarId, { background: string; body: string }> = {
  soup: {
    background: '#FFC9B0',
    body:
      steam([40, 50, 60], 30, '#E8604C') +
      '<rect x="13" y="56" width="10" height="6" rx="3" fill="#B8402F"/><rect x="77" y="56" width="10" height="6" rx="3" fill="#B8402F"/>' +
      '<path d="M22 52H78V72Q78 86 64 86H36Q22 86 22 72Z" fill="#E8604C"/>' +
      '<rect x="18" y="47" width="64" height="9" rx="4.5" fill="#D24E3B"/>' +
      '<ellipse cx="50" cy="48.5" rx="26" ry="3.2" fill="#FFB547"/>' +
      '<circle cx="40" cy="48.5" r="1.6" fill="#7BC74D"/><circle cx="58" cy="48" r="1.4" fill="#F28A3B"/>' +
      '<path d="M27 58Q28 76 36 81" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.35"/>' +
      face(50, 67, { mouth: 'open' }),
  },
  picnic: {
    background: '#CFE8C4',
    body:
      '<path d="M30 56Q30 28 50 28Q70 28 70 56" fill="none" stroke="#9C6428" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M26 56Q36 44 50 52Q64 44 74 56Z" fill="#E85A5A"/>' +
      '<rect x="36" y="49" width="5" height="5" fill="#FFFFFF" opacity="0.8"/><rect x="58" y="49" width="5" height="5" fill="#FFFFFF" opacity="0.8"/>' +
      '<path d="M18 55H82L75 86H25Z" fill="#D99A4E" stroke="#D99A4E" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M21 65H79M23 76H77" stroke="#B97A34" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M34 56L36 86M66 56L64 86" stroke="#B97A34" stroke-width="2.2" stroke-linecap="round"/>' +
      '<rect x="40" y="62" width="20" height="18" rx="6" fill="#F2C27E"/>' +
      face(50, 68, { eyes: 'happy', gap: 5.5, mouthDrop: 4.5, blush: false }),
  },
  challah: {
    background: '#C9D8FF',
    body:
      '<ellipse cx="29" cy="66" rx="15" ry="13" fill="#D98E3C"/>' +
      '<ellipse cx="71" cy="66" rx="15" ry="13" fill="#D98E3C"/>' +
      '<ellipse cx="40" cy="56" rx="14" ry="12" fill="#E8A54E"/>' +
      '<ellipse cx="60" cy="56" rx="14" ry="12" fill="#E8A54E"/>' +
      '<ellipse cx="50" cy="69" rx="19" ry="16" fill="#F0B65E"/>' +
      '<path d="M18 74Q50 92 82 74" fill="none" stroke="#C47A2C" stroke-width="2.2" stroke-linecap="round"/>' +
      '<ellipse cx="36" cy="50" rx="1.6" ry="1" fill="#FFF6E0"/><ellipse cx="44" cy="53" rx="1.6" ry="1" fill="#FFF6E0" transform="rotate(30 44 53)"/>' +
      '<ellipse cx="58" cy="50" rx="1.6" ry="1" fill="#FFF6E0"/><ellipse cx="65" cy="54" rx="1.6" ry="1" fill="#FFF6E0" transform="rotate(-30 65 54)"/>' +
      '<ellipse cx="24" cy="62" rx="1.6" ry="1" fill="#FFF6E0"/><ellipse cx="76" cy="62" rx="1.6" ry="1" fill="#FFF6E0"/>' +
      face(50, 67, { eyes: 'happy', mouth: 'cat' }),
  },
  teapot: {
    background: '#FFE1A8',
    body:
      steam([30, 22], 28, '#FFFFFF') +
      '<path d="M30 64Q18 60 14 46Q20 46 24 50Q28 56 34 58Z" fill="#4E9FD6"/>' +
      '<path d="M70 52Q86 50 84 64Q82 76 68 76" fill="none" stroke="#4E9FD6" stroke-width="5.5" stroke-linecap="round"/>' +
      '<path d="M24 66C24 50 36 42 50 42C64 42 76 50 76 66C76 80 66 87 50 87C34 87 24 80 24 66Z" fill="#6FB7E9"/>' +
      '<path d="M36 44Q50 34 64 44Z" fill="#4E9FD6"/>' +
      '<circle cx="50" cy="36" r="4.5" fill="#4E9FD6"/>' +
      '<path d="M26 72Q50 80 74 72" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 6" opacity="0.9"/>' +
      '<path d="M31 56Q32 50 38 47" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.45"/>' +
      face(50, 60, { mouth: 'smile' }),
  },
  pie: {
    background: '#E3D2FF',
    body:
      steam([42, 58], 26, '#FFFFFF') +
      '<path d="M18 60Q50 32 82 60Z" fill="#F2C27A"/>' +
      '<path d="M30 51L40 58M44 44L56 58M60 46L70 56" stroke="#D99A4E" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M36 58L46 46M52 58L62 45" stroke="#D99A4E" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="44" cy="52" r="2" fill="#C2334D"/><circle cx="56" cy="51" r="2" fill="#C2334D"/>' +
      '<path d="M14 60H86L79 85Q78 88 74 88H26Q22 88 21 85Z" fill="#E07A5F"/>' +
      '<path d="M14 60H86Q86 66 80 66H20Q14 66 14 60Z" fill="#F2C27A"/>' +
      '<path d="M20 63Q23 66 26 63Q29 66 32 63Q35 66 38 63Q41 66 44 63Q47 66 50 63Q53 66 56 63Q59 66 62 63Q65 66 68 63Q71 66 74 63Q77 66 80 63" fill="none" stroke="#D99A4E" stroke-width="1.6" stroke-linecap="round"/>' +
      face(50, 74, { eyes: 'wink', mouthDrop: 4.5 }),
  },
  cheese: {
    background: '#C3E7F5',
    body:
      '<rect x="12" y="80" width="76" height="8" rx="4" fill="#B5835A"/>' +
      '<circle cx="80" cy="84" r="1.5" fill="#8E623F"/>' +
      '<path d="M18 58L72 36Q76 35 78 38L86 58Z" fill="#FFE07A" stroke="#FFE07A" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M18 58H86V78Q86 81 83 81H21Q18 81 18 78Z" fill="#FFC93C"/>' +
      '<ellipse cx="62" cy="47" rx="4" ry="2" fill="#F2B52A"/><ellipse cx="44" cy="53" rx="3" ry="1.5" fill="#F2B52A"/>' +
      '<circle cx="77" cy="68" r="3.5" fill="#E8AE20"/><circle cx="25" cy="73" r="2.5" fill="#E8AE20"/><circle cx="70" cy="76" r="2" fill="#E8AE20"/>' +
      face(48, 66, { mouthDrop: 4.5 }),
  },
  honey: {
    background: '#D6F0C2',
    body:
      '<rect x="24" y="44" width="52" height="44" rx="15" fill="#FFB627"/>' +
      '<rect x="28" y="34" width="44" height="12" rx="4" fill="#E8604C"/>' +
      '<path d="M28 40H72" stroke="#FFFFFF" stroke-width="2.4" stroke-dasharray="4 4" opacity="0.8"/>' +
      '<path d="M28 46H72V50Q68 56 64 50Q60 60 56 50Q52 54 48 50Q44 62 40 50Q36 54 32 50Q30 54 28 50Z" fill="#F29E0C"/>' +
      '<path d="M30 58Q30 76 38 82" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.45"/>' +
      '<g transform="translate(76 26) rotate(15)"><ellipse cx="0" cy="0" rx="7" ry="5.5" fill="#FFD84D"/><path d="M-2 -5V5M2.5 -4.5V4.5" stroke="' +
      INK +
      '" stroke-width="2"/><ellipse cx="-2" cy="-7" rx="4" ry="3" fill="#FFFFFF" opacity="0.9"/><ellipse cx="3" cy="-7" rx="4" ry="3" fill="#FFFFFF" opacity="0.9"/></g>' +
      face(50, 66, { mouth: 'open' }),
  },
  bread: {
    background: '#FFD0DC',
    body:
      '<path d="M24 87V58Q13 56 15 45Q19 30 50 30Q81 30 85 45Q87 56 76 58V87Z" fill="#C77B3A" stroke="#C77B3A" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M29 83V55Q20 53 21 46Q24 36 50 36Q76 36 79 46Q80 53 71 55V83Z" fill="#F7DDA8"/>' +
      '<circle cx="34" cy="74" r="1.2" fill="#E6C185"/><circle cx="66" cy="76" r="1.2" fill="#E6C185"/><circle cx="62" cy="45" r="1" fill="#E6C185"/><circle cx="38" cy="47" r="1" fill="#E6C185"/>' +
      face(50, 60, { eyes: 'happy', mouth: 'open' }),
  },
  tagine: {
    background: '#C8EDE6',
    body:
      '<path d="M14 70H86Q82 86 66 86H34Q18 86 14 70Z" fill="#B8462F"/>' +
      '<path d="M22 72Q36 66 45 32Q50 24 55 32Q64 66 78 72Z" fill="#E07A3F" stroke="#E07A3F" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M30 68Q50 74 70 68" fill="none" stroke="#FFD27A" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M41 43Q50 47 59 43" fill="none" stroke="#FFD27A" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="50" cy="26" r="4.5" fill="#B8462F"/>' +
      '<path d="M14 70H86" stroke="#D45A3A" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M30 78l3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3 3 3 3-3" fill="none" stroke="#FFD27A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      face(50, 55, { gap: 6, mouthDrop: 4.5, mouth: 'cat' }),
  },
  cake: {
    background: '#FFF0B8',
    body:
      '<rect x="47.5" y="26" width="5" height="16" rx="2" fill="#6CC6E8"/>' +
      '<path d="M47.5 30L52.5 28M47.5 36L52.5 34" stroke="#FFFFFF" stroke-width="1.5"/>' +
      '<path d="M50 14Q55 20 53 23Q50 26 47 23Q45 20 50 14Z" fill="#FFB52E"/>' +
      '<rect x="20" y="44" width="60" height="43" rx="8" fill="#F78FAE"/>' +
      '<rect x="20" y="66" width="60" height="5" fill="#FFF3E0"/>' +
      '<path d="M20 52Q20 44 28 44H72Q80 44 80 52V54Q76 60 72 54Q68 62 63 54Q58 58 54 54Q50 62 45 54Q40 58 36 54Q31 62 27 54Q23 58 20 54Z" fill="#FFFFFF"/>' +
      '<circle cx="32" cy="48" r="1.5" fill="#6CC6E8"/><circle cx="62" cy="47" r="1.5" fill="#8EDB6A"/><circle cx="70" cy="49" r="1.5" fill="#FFD84D"/>' +
      face(50, 76, { eyes: 'happy', mouthDrop: 4.2, blush: false }),
  },
  salad: {
    background: '#FFD9CC',
    body:
      '<ellipse cx="34" cy="50" rx="12" ry="9" fill="#7BC74D" transform="rotate(-20 34 50)"/>' +
      '<ellipse cx="66" cy="50" rx="12" ry="9" fill="#7BC74D" transform="rotate(20 66 50)"/>' +
      '<ellipse cx="50" cy="44" rx="11" ry="10" fill="#5DAE3A"/>' +
      '<circle cx="40" cy="52" r="6" fill="#E9473F"/><circle cx="38.5" cy="50.5" r="1.5" fill="#FFFFFF" opacity="0.4"/>' +
      '<circle cx="62" cy="54" r="6.5" fill="#D9F2B4" stroke="#4E9A3A" stroke-width="2"/><circle cx="62" cy="54" r="1.5" fill="#A7D27A"/>' +
      '<path d="M52 50Q56 42 60 44" fill="none" stroke="#FFD84D" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M14 58H86Q84 87 50 87Q16 87 14 58Z" fill="#5BB5E8"/>' +
      '<rect x="12" y="55" width="76" height="7" rx="3.5" fill="#4A9FD1"/>' +
      '<path d="M26 72Q34 82 44 84" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>' +
      face(50, 70, { mouth: 'open' }),
  },
  pancakes: {
    background: '#D7D4FF',
    body:
      '<rect x="16" y="72" width="68" height="14" rx="7" fill="#D98E3C"/>' +
      '<rect x="18" y="60" width="64" height="14" rx="7" fill="#E9A54F"/>' +
      '<rect x="20" y="48" width="60" height="14" rx="7" fill="#F0B65E"/>' +
      '<path d="M22 50Q50 42 78 50Q78 56 72 54Q68 62 64 54Q56 58 50 54Q46 64 42 54Q34 58 28 54Q24 56 22 50Z" fill="#A0522D"/>' +
      '<rect x="43" y="40" width="14" height="9" rx="2.5" fill="#FFE680"/><rect x="45" y="41.5" width="5" height="2" rx="1" fill="#FFFFFF" opacity="0.7"/>' +
      face(50, 64, { eyes: 'happy', mouthDrop: 4.2, gap: 7 }),
  },
};

/** The picture's background colour, for a placeholder while it draws. */
export function householdAvatarBackground(id: HouseholdAvatarId): string {
  return ART[id].background;
}

/** A complete SVG document: a rounded square (corners transparent) with the house and the dish. */
export function householdAvatarSvg(id: HouseholdAvatarId): string {
  const { background, body } = ART[id];
  // The dish is drawn a little larger than its grid so it still reads at 32px.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="26" fill="${background}"/>${HOUSE}<g transform="translate(50 64) scale(1.1) translate(-50 -64)">${body}</g></svg>`;
}

/** The SVG as a data URI, for an <img>. */
export function householdAvatarDataUri(id: HouseholdAvatarId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(householdAvatarSvg(id))}`;
}
