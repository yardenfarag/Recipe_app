import { router } from 'expo-router';

/**
 * Opens Edit recipe (with a recipe id) or Write a recipe (without), ADR 018. Both need an account,
 * so guests, and guest recipes that live only on this device, get the sign-up prompt instead.
 */
export function openRecipeEditor({ signedIn, recipeId }: { signedIn: boolean; recipeId?: string }) {
  if (!signedIn || recipeId?.startsWith('guest-')) {
    router.push('/auth?mode=signup&reason=edit_recipe');
    return;
  }
  if (recipeId) {
    router.push({ pathname: '/recipe/edit', params: { id: recipeId } });
  } else {
    router.push('/recipe/edit');
  }
}
