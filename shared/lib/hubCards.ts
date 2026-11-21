import type { TFunction } from 'i18next';

import type { HubPlatform, RecipeCard } from '../types/recipeCard';

/** The Hub's source filter, in the order both apps show it. */
export const HUB_PLATFORMS = ['all', 'youtube', 'instagram', 'tiktok', 'web'] as const;

export function platformLabelKey(platform: HubPlatform | 'all') {
  switch (platform) {
    case 'youtube':
      return 'hub.platformYoutube';
    case 'instagram':
      return 'hub.platformInstagram';
    case 'tiktok':
      return 'hub.platformTiktok';
    case 'web':
      return 'hub.platformWeb';
    default:
      return 'hub.platformAll';
  }
}

/** The line under a Hub card's title: "YouTube · 3 saves". */
export function hubCardDetail(card: RecipeCard, t: TFunction) {
  const source = t(platformLabelKey(card.platform));
  const saves = t(card.save_count === 1 ? 'hub.saveCountOne' : 'hub.saveCountOther', {
    count: card.save_count,
  });
  return `${source} · ${saves}`;
}
