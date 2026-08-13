import { migrateGuestCollectionsToSupabase } from '@/lib/migrateGuestCollections';
import {
  finalizeGuestRecipeMigration,
  migrateGuestRecipesToSupabase,
} from '@/lib/migrateGuestRecipes';
import { migrateGuestShoppingListToSupabase } from '@/lib/migrateGuestShoppingList';

/** Run id-map consumers before clearing the guest recipes and their journal. */
export async function migrateGuestDataToSupabase(userId: string): Promise<void> {
  const recipeMigration = await migrateGuestRecipesToSupabase(userId);
  await migrateGuestCollectionsToSupabase(userId, recipeMigration.idMap);
  await migrateGuestShoppingListToSupabase(userId, recipeMigration.idMap);
  await finalizeGuestRecipeMigration(userId);
}
