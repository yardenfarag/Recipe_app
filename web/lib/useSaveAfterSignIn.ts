"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "@/components/AuthProvider";

/**
 * A guest pressed Save on an open page (a Hub or shared recipe), signed in, and came back with `?save=1`: run the
 * save once, on its own, then drop `save=1` from the address so a reload or Back doesn't save again.
 *
 * `ready` is false until the page knows enough to save (the recipe has loaded). `save` should be safe to call
 * when the recipe is already in the library (the Hub's claim returns the existing copy).
 */
export function useSaveAfterSignIn({ ready, save }: { ready: boolean; save: () => void }) {
  const { user } = useAuth();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const done = useRef(false);
  const wanted = params.get("save") === "1";

  useEffect(() => {
    if (!wanted || !user || !ready || done.current) return;
    done.current = true;
    const rest = new URLSearchParams(params.toString());
    rest.delete("save");
    router.replace(rest.toString() ? `${pathname}?${rest.toString()}` : pathname);
    save();
  }, [wanted, user, ready, save, params, pathname, router]);

  // Until the address drops `save=1`, a signed-in visitor is about to save: the button shows it is busy.
  return { pending: wanted && Boolean(user) };
}
