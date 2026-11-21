/**
 * Pages Snap links to that aren't on the new web app yet, so they open in the Expo web app at pinch-app.io/app.
 * Replace each with an app path when its screen ships: credits with PIN-141, writing a recipe with PIN-137. Both
 * must land before pinch-app.io/app switches to this app (PIN-147), or these links would point back at it.
 */
export const EXPO_WEB_LINKS = {
  credits: "https://pinch-app.io/app/settings/credits",
  writeRecipe: "https://pinch-app.io/app/recipe/edit",
} as const;
