import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

export const CREDIT_PACKS = [
  { id: 'pinch_credits_10', credits: 10 },
  { id: 'pinch_credits_30', credits: 30 },
  { id: 'pinch_credits_100', credits: 100 },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]['id'];

export interface CreditPack {
  id: CreditPackId;
  credits: number;
  price: string | null;
  storePackage?: PurchasesPackage;
}

let configuredUserId: string | null = null;

function apiKey(): string | undefined {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;
}

export function purchasesEnabled(): boolean {
  return process.env.EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED === 'true' && Boolean(apiKey());
}

export async function configurePurchases(userId: string): Promise<void> {
  const key = apiKey();
  if (!key || !purchasesEnabled()) return;

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
    await Purchases.logOut();
  } finally {
    configuredUserId = null;
  }
}

export async function loadCreditPacks(): Promise<CreditPack[]> {
  if (!purchasesEnabled()) {
    return CREDIT_PACKS.map((pack) => ({ ...pack, price: null }));
  }

  // RevenueCat Billing uses hosted checkout links on web. Native store packages
  // are loaded from the current RevenueCat offering for localized prices.
  if (Platform.OS === 'web') {
    return CREDIT_PACKS.map((pack) => ({ ...pack, price: null }));
  }

  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return CREDIT_PACKS.map((pack) => {
    const storePackage = packages.find(
      (candidate) => candidate.product.identifier === pack.id,
    );
    return {
      ...pack,
      price: storePackage?.product.priceString ?? null,
      storePackage,
    };
  });
}

export async function purchaseCreditPack(
  pack: CreditPack,
): Promise<'purchased' | 'cancelled' | 'opened_web_checkout'> {
  if (!purchasesEnabled()) throw new Error('purchases_unavailable');

  if (Platform.OS === 'web') {
    const url =
      pack.credits === 10
        ? process.env.EXPO_PUBLIC_REVENUECAT_WEB_10_URL
        : pack.credits === 30
          ? process.env.EXPO_PUBLIC_REVENUECAT_WEB_30_URL
          : process.env.EXPO_PUBLIC_REVENUECAT_WEB_100_URL;
    if (!url) throw new Error('web_checkout_unavailable');
    if (!configuredUserId) throw new Error('purchase_user_unavailable');
    const checkoutUrl = new URL(url);
    checkoutUrl.searchParams.set('app_user_id', configuredUserId);
    await Linking.openURL(checkoutUrl.toString());
    return 'opened_web_checkout';
  }

  if (!pack.storePackage) throw new Error('store_product_unavailable');
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
  await Purchases.syncPurchases();
}
