"use client";

import { ArrowRight, Camera, Compass, Link2, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { navItem } from "@/components/shell/nav";
import { buttonClasses } from "@/components/ui/Button";

type Way = { icon: LucideIcon; title: string; body: string; href: string; trackId: string };

/**
 * The empty Library, and so the first thing a new account sees after onboarding: a pointer to Snap, with the four
 * ways to a first recipe (writing one down by hand too, as the mobile Library offers). Each one is a link to where it happens, so there is no dead end.
 */
export function FirstRecipeGuide() {
  const { t } = useTranslation();
  const snap = navItem("snap").href;
  const ways: Way[] = [
    { icon: Link2, title: t("web.firstRecipe.linkTitle"), body: t("web.firstRecipe.linkBody"), href: snap, trackId: "first_recipe.way.link" },
    { icon: Camera, title: t("web.firstRecipe.photoTitle"), body: t("web.firstRecipe.photoBody"), href: snap, trackId: "first_recipe.way.photo" },
    { icon: Compass, title: t("web.firstRecipe.hubTitle"), body: t("web.firstRecipe.hubBody"), href: "/hub", trackId: "first_recipe.way.hub" },
    { icon: PenLine, title: t("recipeEditor.entry.write"), body: t("recipeEditor.entry.writeHint"), href: "/recipe/edit", trackId: "first_recipe.way.write" },
  ];

  return (
    <section aria-labelledby="first-recipe-title" className="overflow-hidden rounded-tile border border-border bg-surface">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12 lg:p-10">
        <div>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary-text">
            <Sparkles aria-hidden className="h-7 w-7" />
          </span>
          <h2 id="first-recipe-title" className="mt-5 text-[28px] leading-[1.05] font-bold text-balance text-text md:text-[40px]">
            {t("web.firstRecipe.title")}
          </h2>
          <p className="mt-3 max-w-md text-base leading-relaxed text-pretty text-muted">{t("web.firstRecipe.body")}</p>
          <Link href={snap} data-track="first_recipe.snap" className={buttonClasses({ variant: "primary", size: "lg", className: "mt-6" })}>
            <Sparkles aria-hidden className="h-4 w-4" />
            {t("snap.title")}
          </Link>
        </div>

        <ul className="grid gap-3">
          {ways.map(({ icon: Icon, title, body, href, trackId }) => (
            <li key={title}>
              <Link
                href={href}
                data-track={trackId}
                className="group flex items-center gap-4 rounded-2xl bg-element px-4 py-4 transition-colors hover:bg-selected focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-bold text-text">{title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">{body}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
