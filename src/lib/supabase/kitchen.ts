import {
  clearGuestKitchenProfile,
  kitchenProfileIsEmpty,
  loadGuestKitchenProfile,
} from '@/lib/kitchenProfile';
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from '@shared/lib/supabase/kitchen';

export { fetchCloudKitchenProfile, saveCloudKitchenProfile };

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
