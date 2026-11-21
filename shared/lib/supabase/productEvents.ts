import type { ProductEventName } from '../productEvents';
import { supabase } from './client';

/**
 * One row in `product_events` (ADR 020). `userId` must be the signed-in user or null (row-level security checks
 * it). The visitor id is sent when signed in too: it ties the account to this visitor's events from before sign-up
 * (the "heard about" answer, a landing-page visit) for the admin dashboard. Properties are fixed values only: never a
 * title, an email or anything typed.
 */
export async function insertProductEvent(row: {
  userId: string | null;
  installId: string;
  name: ProductEventName;
  properties: Record<string, string>;
  country: string | null;
}): Promise<void> {
  const { error } = await supabase.from('product_events').insert({
    user_id: row.userId,
    guest_install_id: row.installId,
    name: row.name,
    properties: row.properties,
    country: row.country,
  });
  if (error) throw error;
}
