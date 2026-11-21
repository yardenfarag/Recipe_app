"use client";

import { useSearchParams } from "next/navigation";
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
  const done = useRef(false);
  const wanted = params.get("save") === "1";

  useEffect(() => {
    if (!wanted || !user || !ready || done.current) return;
    done.current = true;
    // A history update, not a router navigation: the save usually moves on to the saved copy, and a router
    // replace racing it could land last and leave the page here with Save stuck on busy.
    const url = new URL(window.location.href);
    url.searchParams.delete("save");
    window.history.replaceState(window.history.state, "", url);
    save();
  }, [wanted, user, ready, save]);

  // Until the address drops `save=1`, a signed-in visitor is about to save: the button shows it is busy.
  return { pending: wanted && Boolean(user) };
}
