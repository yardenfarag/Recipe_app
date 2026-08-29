import { supabase } from '@/lib/supabase/client';
import {
  assertKitchenProfileSize,
  clearGuestKitchenProfile,
  kitchenProfileIsEmpty,
  loadGuestKitchenProfile,
  sanitizeKitchenProfile,
  type KitchenProfile,
} from '@/lib/kitchenProfile';

export async function fetchCloudKitchenProfile(userId: string): Promise<KitchenProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('kitchen')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return sanitizeKitchenProfile(data?.kitchen);
}

export async function saveCloudKitchenProfile(
  userId: string,
  profile: KitchenProfile,
): Promise<void> {
  const next = sanitizeKitchenProfile(profile);
  assertKitchenProfileSize(next);
  const { error } = await supabase.from('profiles').update({ kitchen: next }).eq('id', userId);
  if (error) throw error;
}

export async function migrateGuestKitchenToCloud(userId: string): Promise<void> {
  const guest = await loadGuestKitchenProfile();
  if (kitchenProfileIsEmpty(guest)) return;
  const cloud = await fetchCloudKitchenProfile(userId);
  if (!kitchenProfileIsEmpty(cloud)) {
    await clearGuestKitchenProfile();
    return;
  }
  await saveCloudKitchenProfile(userId, guest);
  await clearGuestKitchenProfile();
}
