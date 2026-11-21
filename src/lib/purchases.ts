import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { CREDIT_PACKS, type CreditPackId } from '@shared/lib/creditPacks';

// The pack catalog is shared with the new web app.
export { BEST_VALUE_PACK_ID, CREDIT_PACKS, type CreditPackId } from '@shared/lib/creditPacks';

/**
 * The website sells packs through Polar (supabase/functions/polar-checkout), only while
 * purchases are switched on. Otherwise it says to buy in the app. App Store and Play Store
 * purchases go through RevenueCat.
 */
export const WEB_CREDIT_PURCHASES_ENABLED = process.env.EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED === 'true';

export function creditPurchasesOfferedOn(platform: typeof Platform.OS): boolean {
  return platform !== 'web' || WEB_CREDIT_PURCHASES_ENABLED;
}

export function creditPurchasesOfferedHere(): boolean {
  return creditPurchasesOfferedOn(Platform.OS);
}

export interface CreditPack {
  id: CreditPackId;
  credits: number;
  price: string;
  storePackage?: PurchasesPackage;
}

let configuredUserId: string | null = null;

/**
 * The SDK is loaded on first use. Its web build is ~850 KB and the website
 * never talks to it (web checkout is Polar), so it stays out of the
 * initial web bundle.
 */
function loadSdk() {
  return import('react-native-purchases');
}

function apiKey(): string | undefined {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return undefined;
}

export function purchasesEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED !== 'true') return false;
  return Platform.OS === 'web' || Boolean(apiKey());
}

type StoreProductRef = {
  product: { identifier: string; priceString: string };
};

export function displayCreditPacks(
  packages: readonly StoreProductRef[] = [],
): CreditPack[] {
  return CREDIT_PACKS.map((pack) => {
    const storePackage = packages.find(
      (candidate) => candidate.product.identifier === pack.id,
    ) as PurchasesPackage | undefined;
    return {
      id: pack.id,
      credits: pack.credits,
      price: storePackage?.product.priceString ?? pack.catalogPrice,
      storePackage,
    };
  });
}

export function packIsPurchasable(pack: CreditPack): boolean {
  if (!purchasesEnabled()) return false;
  if (Platform.OS === 'web') return WEB_CREDIT_PURCHASES_ENABLED;
  return Boolean(pack.storePackage);
}

export async function configurePurchases(userId: string): Promise<void> {
  const key = apiKey();
  // The web checkout reads the signed-in user on the server; nothing to set up here.
  if (!key || !purchasesEnabled() || Platform.OS === 'web') return;

  const { default: Purchases, LOG_LEVEL } = await loadSdk();
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  if (!configuredUserId) {
    Purchases.configure({ apiKey: key, appUserID: userId });
    configuredUserId = userId;
    return;
  }
  if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }
}

export async function clearPurchasesUser(): Promise<void> {
  if (!configuredUserId || !purchasesEnabled()) return;
  try {
    const { default: Purchases } = await loadSdk();
    await Purchases.logOut();
  } finally {
    configuredUserId = null;
  }
}

export async function loadCreditPacks(): Promise<CreditPack[]> {
  // Catalog prices keep the paywall screenshot-ready even before StoreKit /
  // Play Billing products are approved. Live store strings replace them when
  // the current RevenueCat offering includes the pack.
  if (!purchasesEnabled() || Platform.OS === 'web') {
    return displayCreditPacks();
  }

  const { default: Purchases } = await loadSdk();
  const offerings = await Purchases.getOfferings();
  return displayCreditPacks(offerings.current?.availablePackages ?? []);
}

export async function purchaseCreditPack(
  pack: CreditPack,
): Promise<'purchased' | 'cancelled' | 'opened_web_checkout'> {
  if (!purchasesEnabled()) throw new Error('purchases_unavailable');
  if (Platform.OS === 'web' && !WEB_CREDIT_PURCHASES_ENABLED) {
    throw new Error('web_checkout_unavailable');
  }

  if (Platform.OS === 'web') {
    // Polar's hosted checkout opens in this tab and comes back here with ?checkout_id=…;
    // polar-webhook adds the credits once the order is paid.
    // The app's client module sets up the shared client first.
    await import('@/lib/supabase/client');
    const { startCreditCheckout } = await import('@shared/lib/supabase/creditPurchases');
    const returnUrl = typeof window === 'undefined' ? undefined : window.location.href;
    const checkoutUrl = await startCreditCheckout(pack.id, returnUrl);
    const { markCheckoutStarted } = await import('./webCheckoutReturn');
    markCheckoutStarted();
    window.location.assign(checkoutUrl);
    return 'opened_web_checkout';
  }

  if (!pack.storePackage) throw new Error('store_product_unavailable');
  const { default: Purchases, PURCHASES_ERROR_CODE } = await loadSdk();
  try {
    await Purchases.purchasePackage(pack.storePackage);
    return 'purchased';
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    throw error;
  }
}

export async function syncPurchases(): Promise<void> {
  if (!purchasesEnabled() || Platform.OS === 'web') return;
  const { default: Purchases } = await loadSdk();
  await Purchases.syncPurchases();
}
