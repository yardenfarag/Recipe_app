import { FunctionsHttpError } from '@supabase/supabase-js';

import type { RecipeAppliance } from '../appliances';
import { supabase } from './client';
import type { CostEstimate, EffortLevel, Ingredient, Instruction, RecipeNutrition } from '../../types/recipe';

export type RepairStatus = 'full' | 'partial' | 'failed' | 'ok';

export interface RepairedRecipePayload {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  /** PIN-80. null = none for the repaired recipe; absent = a server from before PIN-80. */
  nutrition?: RecipeNutrition | null;
  estimated_time_minutes?: number;
  cost_estimate?: CostEstimate;
  effort_level?: EffortLevel;
  extraction_status: 'full' | 'partial';
  source_language?: string;
  tags?: string[];
  missing_fields?: string[];
  /** Derived from the repaired steps (ADR 017). null = not analysed. */
  appliances?: RecipeAppliance[] | null;
}

export interface RepairRecipeResult {
  status: RepairStatus;
  recipe?: RepairedRecipePayload;
  summary?: string;
  filled_fields?: string[];
  message?: string;
  code?:
    | 'insufficient_credits'
    | 'auth_required'
    | 'guest_limit'
    | 'guest_id_required'
    | 'no_improvement'
    | 'not_partial'
    | 'compensation_pending'
    | 'metering_error'
    | 'reservation_required'
    | string;
  tokens_charged?: number;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
  request_id?: string;
  reservation_id?: string;
  pending_credit?: boolean;
  /** Opaque copy of the repaired recipe; hand it back on commit to get `recipe`. */
  sealed_recipe?: string;
}

export interface RepairRecipeRequest {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  estimated_time_minutes?: number;
  cost_estimate?: CostEstimate;
  effort_level?: EffortLevel;
  tags?: string[];
  source_language?: string;
  original_url?: string;
}

export function repairRequestKey(recipe: RepairRecipeRequest): string {
  return `repair:${recipe.original_url ?? recipe.title}:${recipe.ingredients.length}:${recipe.instructions.length}`;
}

async function invokeErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
}> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as RepairRecipeResult & { error?: string };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
          guest_extracts_remaining: body.guest_extracts_remaining,
          extracts_remaining: body.extracts_remaining,
          purchased_credits: body.purchased_credits,
          total_credits: body.total_credits,
        };
      }
    } catch {
      // Fall through.
    }
  }
  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return { message: error.message };
  }
  return { message: 'Could not reach the repair service. Please try again.' };
}

/**
 * Where each app keeps the request id that makes a repair charge once (shared/lib/extractionRequestId.ts, with the
 * app's storage). The same shape as an import's `ExtractionRequestContext`, so either app passes the one it has.
 */
export interface RepairRequestContext {
  getOrCreateRequestId: (key: string) => Promise<string>;
}

/**
 * Asks `repair-recipe` to fill in a partial import (ADR 019). The credit is only reserved here: the caller shows the
 * summary, then commits (the repaired recipe comes back) or aborts (nothing is charged) with `settleRepairRecipe`.
 */
export async function repairRecipe(
  context: RepairRequestContext,
  recipe: RepairRecipeRequest,
): Promise<RepairRecipeResult> {
  const requestId = await context.getOrCreateRequestId(repairRequestKey(recipe));

  const { data, error } = await supabase.functions.invoke<RepairRecipeResult>('repair-recipe', {
    body: {
      original_url: recipe.original_url,
      request_id: requestId,
      recipe: {
        title: recipe.title,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        calories: recipe.calories,
        estimated_time_minutes: recipe.estimated_time_minutes,
        cost_estimate: recipe.cost_estimate,
        effort_level: recipe.effort_level,
        tags: recipe.tags,
        source_language: recipe.source_language,
      },
    },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return {
      status: 'failed',
      message: details.message,
      code: details.code,
      request_id: requestId,
      guest_extracts_remaining: details.guest_extracts_remaining,
      extracts_remaining: details.extracts_remaining,
      purchased_credits: details.purchased_credits,
      total_credits: details.total_credits,
    };
  }

  return data
    ? { ...data, request_id: requestId }
    : { status: 'failed', message: 'No response from the repair service.', request_id: requestId };
}

export async function settleRepairRecipe(
  action: 'commit' | 'abort',
  reservationId: string,
  requestId?: string,
  sealedRecipe?: string,
): Promise<RepairRecipeResult> {
  const { data, error } = await supabase.functions.invoke<RepairRecipeResult>('repair-recipe', {
    body: {
      action,
      reservation_id: reservationId,
      request_id: requestId,
      sealed_recipe: action === 'commit' ? sealedRecipe : undefined,
    },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return {
      status: 'failed',
      message: details.message,
      code: details.code,
      request_id: requestId,
    };
  }

  return data
    ? { ...data, request_id: requestId }
    : { status: 'failed', message: 'No response from the repair service.', request_id: requestId };
}
