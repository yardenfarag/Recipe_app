/**
 * The generated database types (`npm run db:types`, shared with the Edge Functions) and the few casts the app needs at
 * the boundary between them and the app's own types. Each one does nothing at runtime.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Database,
  Json,
  TablesInsert,
  TablesUpdate,
} from '../../../supabase/functions/_shared/core/database.types';
import { supabase } from './client';

export type { Database, Json, TablesInsert, TablesUpdate };

type TableName = keyof Database['public']['Tables'];

/**
 * An RPC argument that is SQL null. The generated `Args` types can't say a parameter accepts null, but these SQL
 * functions handle it. Use it only where the SQL function is written for null.
 */
export function sqlNullable<T>(value: T | null): T {
  return value as T;
}

/** A value for a `jsonb` column. App types (arrays of ingredients, records) are valid JSON but not typed as `Json`. */
export function toJson(value: unknown): Json {
  return value as Json;
}

/** A row built from app types (`Recipe`, guest recipes, backups). Postgres checks its columns, the compiler doesn't. */
export function untypedInsert<T extends TableName>(row: object): TablesInsert<T> {
  return row as TablesInsert<T>;
}

/** Like `untypedInsert`, for updates. */
export function untypedUpdate<T extends TableName>(row: object): TablesUpdate<T> {
  return row as TablesUpdate<T>;
}

/** The client without schema types, for code that works on any table by name (the backup export). */
export function untypedSupabase(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}
