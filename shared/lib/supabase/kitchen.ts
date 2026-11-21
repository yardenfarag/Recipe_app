import { supabase } from './client';
import { assertKitchenProfileSize, sanitizeKitchenProfile, type KitchenProfile } from '../kitchenProfile';

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
