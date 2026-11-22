"use client";

import { UserRound } from "lucide-react";
import { type ReactNode, useState } from "react";

import { foodAvatarDataUri, foodAvatarIdFrom, isFoodAvatarValue } from "@shared/lib/foodAvatars";

import { cn } from "@/lib/cn";

/**
 * The profile picture: a chosen food avatar, an uploaded photo, or `fallback` (a person outline by default) when
 * there is none or the photo doesn't load.
 */
export function ProfileAvatar({ url, className, fallback }: { url: string | null; className?: string; fallback?: ReactNode }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const food = foodAvatarIdFrom(url);
  // A food avatar from a newer version isn't a URL either: show the fallback rather than try to load it.
  const photo = url && !isFoodAvatarValue(url) && failedUrl !== url ? url : null;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary-text", className)}>
      {food ? (
        // A drawing that ships with the app, already square.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foodAvatarDataUri(food)} alt="" className="h-full w-full" />
      ) : photo ? (
        // A small photo from Supabase Storage, already square: nothing for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" decoding="async" onError={() => setFailedUrl(photo)} className="h-full w-full object-cover" />
      ) : (
        (fallback ?? <UserRound className="h-1/2 w-1/2" />)
      )}
    </span>
  );
}
