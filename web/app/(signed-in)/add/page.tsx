"use client";

import { useTranslation } from "react-i18next";

import { ComingSoon } from "@/components/shell/ComingSoon";

/** Snap: import a recipe from a link or a photo. The real one arrives with PIN-133. */
export default function SnapPage() {
  const { t } = useTranslation();
  return <ComingSoon section="snap" title={t("snap.title")} subtitle={t("snap.subtitle")} />;
}
