import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase/client';

const AVATAR_BUCKET = 'avatars';

export interface Profile {
  id: string;
  email: string | null;
  avatar_url: string | null;
  token_balance: number;
  is_admin: boolean;
  token_pack_notify_at: string | null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, avatar_url, token_balance, is_admin, token_pack_notify_at')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row
    throw error;
  }
  const row = data as {
    id: string;
    email: string | null;
    avatar_url: string | null;
    token_balance?: number | null;
    is_admin?: boolean | null;
    token_pack_notify_at?: string | null;
  };
  return {
    id: row.id,
    email: row.email,
    avatar_url: row.avatar_url,
    token_balance: typeof row.token_balance === 'number' ? row.token_balance : 0,
    is_admin: row.is_admin === true,
    token_pack_notify_at: row.token_pack_notify_at ?? null,
  };
}

/** Opt in to token-pack launch emails. Idempotent if already set. */
export async function requestTokenPackNotify(userId: string): Promise<string> {
  const at = new Date().toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .update({ token_pack_notify_at: at })
    .eq('id', userId)
    .is('token_pack_notify_at', null)
    .select('token_pack_notify_at')
    .maybeSingle();

  if (error) throw error;
  if (data?.token_pack_notify_at) return data.token_pack_notify_at;

  const existing = await fetchProfile(userId);
  if (existing?.token_pack_notify_at) return existing.token_pack_notify_at;
  throw new Error('Could not save notify preference.');
}

/**
 * Uploads a locally-picked image (as base64, from `expo-image-picker`) to the
 * `avatars` Storage bucket and points `profiles.avatar_url` at the resulting
 * public URL. React Native's `fetch`/`Blob` upload path is unreliable with
 * Supabase Storage, so we decode base64 -> ArrayBuffer instead (the
 * documented working approach).
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  fileExt: string,
): Promise<string> {
  const path = `${userId}-${Date.now()}.${fileExt}`;
  const arrayBuffer = decode(base64);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);
  if (updateError) throw updateError;

  return publicUrl;
}
