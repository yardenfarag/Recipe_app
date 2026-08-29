import { FunctionsHttpError } from '@supabase/supabase-js';

import { getOrCreateExtractionRequestId } from '@/lib/extractionRequestId';
import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';
import type { ExtractResult } from '@/lib/supabase/extractRecipe';

export type InventResult = ExtractResult;

async function inventErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  free_extracts_remaining?: number | null;
  monthly_extracts_remaining?: number | null;
  subscription_status?: string | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
}> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as InventResult & { error?: string };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
          guest_extracts_remaining: body.guest_extracts_remaining,
          extracts_remaining: body.extracts_remaining,
          free_extracts_remaining: body.free_extracts_remaining,
          monthly_extracts_remaining: body.monthly_extracts_remaining,
          subscription_status: body.subscription_status,
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
  return { message: 'Could not reach the invent service. Please try again.' };
}

async function invokeInvent(
  requestId: string,
  body: Record<string, unknown>,
): Promise<InventResult> {
  const { data, error } = await supabase.functions.invoke<InventResult>('invent-recipe', {
    body,
  });

  if (error) {
    const details = await inventErrorMessage(error);
    return {
      status: 'failed',
      platform: 'unknown',
      message: details.message,
      code: details.code,
      request_id: requestId,
      guest_extracts_remaining: details.guest_extracts_remaining,
      extracts_remaining: details.extracts_remaining,
      free_extracts_remaining: details.free_extracts_remaining,
      monthly_extracts_remaining: details.monthly_extracts_remaining,
      subscription_status: details.subscription_status,
      purchased_credits: details.purchased_credits,
      total_credits: details.total_credits,
    };
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const errBody = data as { error?: string };
    if (typeof errBody.error === 'string') {
      return {
        status: 'failed',
        platform: 'unknown',
        message: errBody.error,
        request_id: requestId,
      };
    }
  }

  return data
    ? { ...data, request_id: requestId }
    : {
        status: 'failed',
        platform: 'unknown',
        message: 'No response from the invent service.',
        request_id: requestId,
      };
}

export async function inventRecipe(
  url: string,
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  const guestInstallId = await getInstallId();
  const requestId = await getOrCreateExtractionRequestId(`invent:${url}`);
  return invokeInvent(requestId, {
    url,
    language,
    guest_install_id: guestInstallId,
    request_id: requestId,
    ...(opts?.alreadyGated ? { already_gated: true } : {}),
  });
}

export async function inventRecipeFromImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
  language = 'en',
  opts?: { alreadyGated?: boolean },
): Promise<InventResult> {
  const guestInstallId = await getInstallId();
  const key = `invent-photo:${imageBase64.length}:${imageBase64.slice(0, 64)}`;
  const requestId = await getOrCreateExtractionRequestId(key);
  return invokeInvent(requestId, {
    image_base64: imageBase64,
    image_mime: mimeType,
    language,
    guest_install_id: guestInstallId,
    request_id: requestId,
    ...(opts?.alreadyGated ? { already_gated: true } : {}),
  });
}
