"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { navItem, type NavItem } from "@/components/shell/nav";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";

/**
 * A section that isn't on the web yet: its real header, and a card that says what it will do for you.
 * Each screen ticket (PIN-131 to PIN-141) replaces one of these.
 */
export function ComingSoon({
  section,
  title,
  subtitle,
  action,
}: {
  section: NavItem["id"];
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const item = navItem(section);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} tabTitle={t(item.labelKey)} />
      <section className="rounded-3xl border border-frosted-border bg-surface/70 shadow-soft backdrop-blur-sm md:py-6">
        <EmptyState
          icon={<item.icon aria-hidden />}
          title={t(`web.soon.${section}.title`)}
          body={t(`web.soon.${section}.body`)}
          action={
            <div className="flex flex-col items-center gap-4">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{t("web.comingSoon")}</span>
              {action}
            </div>
          }
        />
      </section>
    </>
  );
}

/** "Snap a recipe" as a link, for empty sections that fill up from Snap. */
export function SnapLink() {
  const { t } = useTranslation();
  const snap = navItem("snap");
  return (
    <Link href={snap.href} className={buttonClasses({ variant: "primary" })}>
      <snap.icon aria-hidden className="h-4 w-4" />
      {t("snap.title")}
    </Link>
  );
}
