import { type Href, router } from 'expo-router';

/**
 * Leave the current stack screen. Prefer an explicit stack pop (`dismiss`)
 * over `router.back()` / GO_BACK — on web, GO_BACK can desync from history
 * and appear to do nothing. Falls back to replace when there is no stack.
 */
export function goBackOrHome(fallback: Href = '/') {
  if (router.canDismiss()) {
    router.dismiss();
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
