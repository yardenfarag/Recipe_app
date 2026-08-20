import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

export const CREDIT_PACKS = [
  { id: 'pinch_credits_10', credits: 10, catalogPrice: '$1.99' },
  { id: 'pinch_credits_30', credits: 30, catalogPrice: '$4.99' },
  { id: 'pinch_credits_100', credits: 100, catalogPrice: '$12.99' },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]['id'];

export const BEST_VALUE_PACK_ID: CreditPackId = 'pinch_credits_100';

export interface CreditPack {
  id: CreditPackId;
  credits: number;
  price: string;
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
  if (Platform.OS === 'web') return true;
  return Boolean(pack.storePackage);
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
  // Catalog prices keep the paywall screenshot-ready even before StoreKit /
  // Play Billing products are approved. Live store strings replace them when
  // the current RevenueCat offering includes the pack.
  if (!purchasesEnabled() || Platform.OS === 'web') {
    return displayCreditPacks();
  }

  const offerings = await Purchases.getOfferings();
  return displayCreditPacks(offerings.current?.availablePackages ?? []);
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
