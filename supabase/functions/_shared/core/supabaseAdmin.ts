import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.6';

import type { Database, Json, TablesUpdate } from './database.types.ts';

export type { Json, TablesInsert, TablesUpdate } from './database.types.ts';

/**
 * An RPC argument that is SQL null. The generated `Args` types can't say a parameter accepts null, but these SQL
 * functions handle it. Sending null (not omitting the key) keeps the call matching the function's signature.
 * Use it only where the SQL function is written for null.
 */
export function sqlNullable<T>(value: T | null): T {
  return value as T;
}

/** A value for a `jsonb` column. Domain types (arrays of objects, records) are valid JSON but not typed as `Json`. */
export function toJson(value: unknown): Json {
  return value as Json;
}

/**
 * A row still built as `Record<string, unknown>` (save-recipe-edit, recipeRecalc). Postgres checks its columns, the
 * compiler doesn't. Replace with a typed row when the code is converted (PIN-34).
 */
export function untypedUpdate<T extends keyof Database['public']['Tables']>(
  row: Record<string, unknown>,
): TablesUpdate<T> {
  return row as TablesUpdate<T>;
}

/**
 * A Supabase client typed with the generated schema (`database.types.ts`, from `npm run db:types`).
 * Every helper that takes a client takes this.
 */
export type Db = SupabaseClient<Database>;

/** Service-role client: bypasses row level security. Use only after the caller has been authorised. */
export function createServiceSupabase(): Db | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient<Database>(supabaseUrl, serviceKey);
}
