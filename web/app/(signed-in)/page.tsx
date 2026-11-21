"use client";

import { useTranslation } from "react-i18next";

import { ComingSoon, SnapLink } from "@/components/shell/ComingSoon";

/** Library: the home screen. The real one arrives with PIN-131. */
export default function LibraryPage() {
  const { t } = useTranslation();
  return <ComingSoon section="library" title={t("library.title")} action={<SnapLink />} />;
}
