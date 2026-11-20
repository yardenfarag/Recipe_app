"use client";

import { useTranslation } from "react-i18next";

import { ComingSoon, SnapLink } from "@/components/shell/ComingSoon";

/** Shopping list. The real one arrives with PIN-134. */
export default function ListPage() {
  const { t } = useTranslation();
  return <ComingSoon section="list" title={t("list.title")} subtitle={t("list.subtitle")} action={<SnapLink />} />;
}
