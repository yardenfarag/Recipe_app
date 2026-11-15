import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

export const CREDIT_PACKS = [
  { id: 'pinch_credits_10', credits: 10, catalogPrice: '$1.99' },
  { id: 'pinch_credits_30', credits: 30, catalogPrice: '$4.99' },
  { id: 'pinch_credits_100', credits: 100, catalogPrice: '$7.99' },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]['id'];

export const BEST_VALUE_PACK_ID: CreditPackId = 'pinch_credits_100';

/**
 * Paddle price ids (pri_…) for each pack on the web. RevenueCat's web checkout
 * needs Stripe, which doesn't support this account's country, so the website
 * sells through Paddle instead (src/lib/paddleCheckout.ts). App Store and Play
 * Store purchases still go through RevenueCat.
 */
const PADDLE_PRICE_IDS: Readonly<Record<CreditPackId, string | undefined>> = {
  pinch_credits_10: process.env.EXPO_PUBLIC_PADDLE_PRICE_10,
  pinch_credits_30: process.env.EXPO_PUBLIC_PADDLE_PRICE_30,
  pinch_credits_100: process.env.EXPO_PUBLIC_PADDLE_PRICE_100,
};

/**
 * The website sells packs only when purchases are switched on and Paddle's client token and
 * every pack's price id are set. Otherwise it says to buy in the app, instead of showing packs
 * that can't be bought.
 */
export const WEB_CREDIT_PURCHASES_ENABLED =
  process.env.EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED === 'true' &&
  Boolean(process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN) &&
  Object.values(PADDLE_PRICE_IDS).every(Boolean);

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
let configuredEmail: string | null = null;

/**
 * The SDK is loaded on first use. Its web build is ~850 KB and the website
 * never talks to it (web checkout is Paddle), so it stays out of the
 * initial web bundle.
 */
function loadSdk() {
  return import('react-native-purchases');
}

function apiKey(): string | undefined {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN;
}

export function purchasesEnabled(): boolean {
  return process.env.EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED === 'true' && Boolean(apiKey());
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

export async function configurePurchases(userId: string, email?: string | null): Promise<void> {
  const key = apiKey();
  if (!key || !purchasesEnabled()) return;

  // Web checkout tags the payment with the user id, and fills in their email.
  if (Platform.OS === 'web') {
    configuredUserId = userId;
    configuredEmail = email ?? null;
    return;
  }

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
  if (Platform.OS === 'web') {
    configuredUserId = null;
    configuredEmail = null;
    return;
  }
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
    const token = process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN;
    const priceId = PADDLE_PRICE_IDS[pack.id];
    if (!token || !priceId) throw new Error('web_checkout_unavailable');
    if (!configuredUserId) throw new Error('purchase_user_unavailable');
    const { openPaddleCheckout } = await import('./paddleCheckout');
    // 'purchased' once Paddle took the payment; the webhook adds the credits moments later.
    return await openPaddleCheckout({
      token,
      environment: process.env.EXPO_PUBLIC_PADDLE_ENVIRONMENT,
      priceId,
      userId: configuredUserId,
      email: configuredEmail,
    });
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
