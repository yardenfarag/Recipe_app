// The repair call lives in shared/lib/supabase/repairRecipe.ts so the web app uses the same code (PIN-135).
// Mobile keeps its old signature here, with the request ids in device storage.
import '@/lib/supabase/client';
import { getOrCreateExtractionRequestId } from '@/lib/extractionRequestId';
import {
  repairRecipe as repairRecipeWith,
  type RepairRecipeRequest,
  type RepairRecipeResult,
} from '@shared/lib/supabase/repairRecipe';

export {
  repairRequestKey,
  settleRepairRecipe,
  type RepairedRecipePayload,
  type RepairRecipeRequest,
  type RepairRecipeResult,
  type RepairStatus,
} from '@shared/lib/supabase/repairRecipe';

export function repairRecipe(recipe: RepairRecipeRequest): Promise<RepairRecipeResult> {
  return repairRecipeWith({ getOrCreateRequestId: getOrCreateExtractionRequestId }, recipe);
}
