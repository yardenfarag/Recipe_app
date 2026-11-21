"use client";

import { SnapPreview } from "@/components/snap/SnapPreview";

/**
 * A Snap's recipe before it is saved. Same address as the Expo web app (ADR 026); the navigation counts it as Snap
 * (web/components/shell/nav.ts). A fixed segment, so it wins over /recipe/[id].
 */
export default function RecipePreviewPage() {
  return <SnapPreview />;
}
