import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function createServiceSupabase(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}
