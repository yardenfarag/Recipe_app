"use client";

import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";

export function Spinner({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span role="status" className={cn("inline-flex items-center gap-3", className)}>
      <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-primary-soft border-t-primary" />
      {label ? <span className="text-muted">{label}</span> : <span className="sr-only">{t("a11y.loading")}</span>}
    </span>
  );
}
