"use client";

import { useTranslation } from "react-i18next";

import { ComingSoon } from "@/components/shell/ComingSoon";

/** Cooking Hub. The real one arrives with PIN-138. */
export default function HubPage() {
  const { t } = useTranslation();
  return <ComingSoon section="hub" title={t("hub.title")} subtitle={t("hub.subtitle")} />;
}
