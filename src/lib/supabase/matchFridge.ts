import { FunctionsHttpError } from '@supabase/supabase-js';

import type { FridgeCatalogItem } from '@/lib/fridgeCatalog';
import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';

export type { FridgeCatalogItem };

export type FridgeMatchRow = {
  id: string;
  score: number;
  matched: string[];
  missing: string[];
  reason: string;
};

export type MatchFridgeResult = {
  status: 'ok' | 'failed';
  matches?: FridgeMatchRow[];
  message?: string;
  code?: 'daily_limit' | 'empty_library' | 'guest_id_required' | 'metering_error' | string;
};

export async function matchFridge(
  imageBase64: string,
  mimeType: string,
  catalog: FridgeCatalogItem[],
): Promise<MatchFridgeResult> {
  const guestInstallId = await getInstallId();
  const { data, error } = await supabase.functions.invoke<MatchFridgeResult>('match-fridge', {
    body: {
      image_base64: imageBase64,
      image_mime: mimeType,
      catalog,
      guest_install_id: guestInstallId,
    },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as MatchFridgeResult & { error?: string };
        return {
          status: 'failed',
          message: body.message ?? body.error,
          code: body.code,
        };
      } catch {
        // Fall through.
      }
    }
    return { status: 'failed', message: 'Could not reach the fridge match service.' };
  }

  return data ?? { status: 'failed', message: 'No response from fridge match.' };
}
