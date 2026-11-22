"use client";

import { useState } from "react";

import { CookieMark } from "@/components/CookieMark";
import { cn } from "@/lib/cn";

/** A recipe's photo as a small square, or the cookie when it has none (or it will not load). */
export function RecipeThumb({ src, className }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-primary-text", className)}>
      {src && !failed ? (
        // Already small pictures from other sites: nothing for next/image to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <CookieMark size={20} />
      )}
    </span>
  );
}
