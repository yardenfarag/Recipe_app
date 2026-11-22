"use client";

import { useEffect } from "react";

import type { InAppMessage } from "@shared/lib/inAppMessages";

import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/cn";

import { BannerPresenter } from "./BannerPresenter";
import { useActiveInAppMessage, useInAppMessageActions } from "./controller";
import { useMessageView } from "./useMessageView";

function isBanner(message: InAppMessage | null): message is InAppMessage {
  // A required message is always full screen, whatever its row says.
  return message !== null && message.presentation === "banner" && !message.required;
}

function BannerView({ message, position }: { message: InAppMessage; position: "top" | "bottom" }) {
  const { language } = useLanguage();
  const view = useMessageView(message, language);
  const { onClose, onPress, onShown } = useInAppMessageActions(message);

  // Drawn, so it can be seen. The controller records `seen` once.
  useEffect(() => {
    onShown();
  }, [onShown]);

  return (
    <div
      className={cn(
        // The same column and side margins as the page under it (AppShell), so the tile lines up with the page's tiles.
        "mx-auto w-full max-w-[84rem] px-4 sm:px-6 md:ps-2 md:pe-8 lg:pe-10",
        position === "top"
          ? "pt-3 md:pt-5"
          : // Above the phone tab bar (clear of the raised Snap button); at the bottom of the window on wider screens.
            "sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4",
      )}
    >
      <BannerPresenter view={view} handlers={{ onClose, onPress }} edge={position} />
    </div>
  );
}

/**
 * Where a `banner` message appears: AppShell mounts `position="top"` above the page and `position="bottom"` under it.
 * Each shows only the message whose `bannerPosition` matches (default top).
 */
export function InAppMessageBanner({ position }: { position: "top" | "bottom" }) {
  const message = useActiveInAppMessage();
  if (!isBanner(message)) return null;
  if ((message.bannerPosition ?? "top") !== position) return null;
  return <BannerView key={message.id} message={message} position={position} />;
}
