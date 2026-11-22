"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/** The profile photo, or a person outline when there is none (or it doesn't load). */
export function ProfileAvatar({ url, className }: { url: string | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = url && failedUrl !== url;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary-text", className)}>
      {showPhoto ? (
        // A small photo from Supabase Storage, already square: nothing for next/image to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-1/2 w-1/2" />
      )}
    </span>
  );
}
