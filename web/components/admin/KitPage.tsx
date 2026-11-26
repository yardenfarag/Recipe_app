"use client";

import { Heart, LayoutGrid, List, MoreHorizontal, Play, Scale, Share, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { HOUSEHOLD_AVATAR_IDS, householdAvatarValue } from "@shared/lib/householdAvatars";

import { AvatarStack, HouseholdAvatar, MemberAvatar } from "@/components/household/HouseholdAvatar";
import { SnapBarField } from "@/components/snapbar/SnapBarField";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { FactTile, PhotoTile, StatTile, Tile, TileBadge, TileLabel } from "@/components/ui/Tile";

/** A flat picture standing in for a recipe photo, so the photo tile can be judged without one. */
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(28 80% 64%)"/><stop offset="1" stop-color="hsl(8 70% 46%)"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><circle cx="430" cy="190" r="120" fill="hsl(44 90% 70%)" opacity="0.7"/></svg>',
)}`;

/** People for the avatar stacks: a food avatar, initials, and enough of them to show "+n". */
const KIT_PEOPLE = [
  { displayName: "Dana", avatarUrl: "food:avocado" },
  { displayName: "Avi", avatarUrl: null },
  { displayName: "נועה", avatarUrl: "food:taco" },
  { displayName: "Eli", avatarUrl: null },
  { displayName: "Maya", avatarUrl: "food:donut" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <TileLabel as="h2">{title}</TileLabel>
      {children}
    </section>
  );
}

/**
 * The Night Market kit on one page (PIN-160), for us: every building block the screens use, to check in each theme
 * pack, in light and dark, left-to-right and right-to-left. The screenshots test photographs it in all of them.
 * Unlike the other admin pages it follows the app's language, since direction is part of what it checks.
 */
export function KitPage() {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [system, setSystem] = useState<"original" | "metric">("original");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [servings, setServings] = useState(4);

  return (
    <div dir={i18n.dir()} lang={i18n.language} className="flex flex-col gap-8">
      <PageHeader title="Kit" subtitle={t("library.title")} />

      <Section title="Type">
        <Tile className="flex flex-col gap-3 p-6">
          <p className="font-display text-6xl leading-[0.95] font-bold tracking-tight rtl:leading-[1.15] rtl:tracking-normal">{t("tabs.library")} 42</p>
          <h2 className="text-[26px] font-bold">{t("recipe.ingredients")}</h2>
          <p className="max-w-prose text-[17px] leading-relaxed text-text">{t("snap.subtitle")}</p>
          <p className="text-sm text-muted">{t("library.cookTonightRule")}</p>
          <TileLabel>{t("recipe.servings")}</TileLabel>
          <div className="flex flex-wrap gap-2">
            <TileBadge>{t("library.cookTonight")}</TileBadge>
            <span className="text-sm font-bold text-primary-text">{t("recipe.remix")}</span>
            <span className="text-sm font-bold text-accent-text">{t("recipe.translate")}</span>
          </div>
        </Tile>
      </Section>

      <Section title="Buttons">
        <Tile className="flex flex-col gap-4 p-6">
          {(["lg", "md", "sm"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2.5">
              <Button size={size}>{t("web.snapBar.action")}</Button>
              <Button size={size} variant="secondary">
                {t("recipe.remix")}
              </Button>
              <Button size={size} variant="outline">
                {t("recipe.cookedAction")}
              </Button>
              <Button size={size} variant="ghost">
                {t("common.cancel")}
              </Button>
              <Button size={size} variant="danger">
                {t("common.delete")}
              </Button>
              <Button size={size} disabled>
                {t("common.save")}
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2.5">
            <IconButton label={t("library.favorites")} icon={<Heart aria-hidden className="h-5 w-5" />} />
            <IconButton variant="tile" label={t("recipe.share")} icon={<Share aria-hidden className="h-5 w-5" />} />
            <IconButton variant="tile" label={t("a11y.moreOptions")} icon={<MoreHorizontal aria-hidden className="h-5 w-5" />} />
            <Button variant="link">{t("web.recipe.viewOriginal")}</Button>
          </div>
        </Tile>
      </Section>

      <Section title="Chips, segmented control, stepper, field">
        <Tile className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", t("library.allCollections")],
              ["favorites", t("library.favorites")],
              ["tonight", t("library.cookTonight")],
              ["fridge", t("library.fridgeMatch")],
            ].map(([id, label]) => (
              <Chip key={id} selected={filter === id} onClick={() => setFilter(id)}>
                {label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label={`${t("measurement.spoons")} / ${t("measurement.grams")}`}
              value={system}
              onChange={setSystem}
              options={[
                { value: "original", label: t("measurement.spoons"), icon: <UtensilsCrossed aria-hidden className="h-4 w-4" /> },
                { value: "metric", label: t("measurement.grams"), icon: <Scale aria-hidden className="h-4 w-4" /> },
              ]}
            />
            <SegmentedControl
              label={`${t("library.showGrid")} / ${t("library.showList")}`}
              value={layout}
              onChange={setLayout}
              options={[
                { value: "grid", label: t("library.showGrid"), icon: <LayoutGrid aria-hidden className="h-5 w-5" />, iconOnly: true },
                { value: "list", label: t("library.showList"), icon: <List aria-hidden className="h-5 w-5" />, iconOnly: true },
              ]}
            />
            <Stepper
              value={servings}
              onChange={setServings}
              min={1}
              max={12}
              label={t("recipe.servings")}
              decreaseLabel={t("recipe.decreaseServings")}
              increaseLabel={t("recipe.increaseServings")}
              spokenValue={t("cookbook.servings", { count: servings })}
            >
              {t("cookbook.servings", { count: servings })}
            </Stepper>
          </div>
          <SnapBarField />
          <div className="max-w-sm">
            <TextField label={t("library.collectionNamePlaceholder")} placeholder={t("library.searchPlaceholder")} />
          </div>
        </Tile>
      </Section>

      <Section title="Tiles">
        <div className="grid auto-rows-[190px] grid-cols-2 gap-4 lg:grid-cols-4">
          <PhotoTile src={PHOTO} className="col-span-2 row-span-2" contentClassName="gap-3 p-6 sm:p-7">
            <TileBadge tone="photo">{t("library.cookTonight")}</TileBadge>
            <p className="font-display text-5xl leading-[0.95] font-bold tracking-tight rtl:leading-[1.15] rtl:tracking-normal sm:text-6xl">Shakshuka</p>
            <p className="text-[15px] text-on-scrim-muted">{t("cookbook.servings", { count: 4 })}</p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" className="h-12 rounded-btn bg-on-scrim px-5 font-display text-[15px] font-bold text-scrim">
                {t("web.cook.cookMode")}
              </button>
              <button type="button" className="inline-flex h-12 items-center gap-2 rounded-btn bg-on-scrim/15 px-5 text-[15px] font-semibold text-on-scrim">
                <Play aria-hidden className="h-4 w-4 fill-current" />
                {t("cookAlong.title")}
              </button>
              <IconButton variant="photo" label={t("library.favorites")} icon={<Heart aria-hidden className="h-5 w-5" />} />
            </div>
          </PhotoTile>
          <Tile tone="primary" className="row-span-2 flex flex-col justify-between p-6">
            <span aria-hidden className="font-display text-6xl leading-none font-bold">
              +
            </span>
            <div>
              <p className="font-display text-[34px] leading-none font-bold tracking-tight rtl:leading-tight rtl:tracking-normal">{t("snap.title")}</p>
              <p className="mt-2.5 text-[15px] leading-snug">{t("snap.subtitle")}</p>
            </div>
          </Tile>
          <StatTile label={t("recipe.servings")} value={3} />
          <Tile className="flex flex-col gap-2.5 p-5">
            <TileLabel>{t("tabs.list")}</TileLabel>
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" defaultChecked className="h-[18px] w-[18px]" />
              <span className="text-muted line-through">{t("recipe.ingredients")}</span>
            </label>
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" className="h-[18px] w-[18px]" />
              {t("recipe.instructions")}
            </label>
          </Tile>
        </div>
        <Tile className="grid grid-cols-2 gap-2.5 p-6 sm:grid-cols-4">
          <FactTile value="25m" label={t("recipeEditor.fields.time")} />
          <FactTile value="4" label={t("recipe.servings")} />
          <FactTile value="310" label={t("recipeEditor.fields.calories")} />
          <FactTile value="●●○" label={t("recipeEditor.fields.cost")} />
        </Tile>
      </Section>

      <Section title="Household pictures and people">
        <Tile className="flex flex-col gap-5 p-6">
          <div className="flex flex-wrap items-end gap-3">
            {HOUSEHOLD_AVATAR_IDS.map((id, index) => (
              <HouseholdAvatar key={id} value={householdAvatarValue(id)} className={index % 3 === 0 ? "h-24 w-24" : index % 3 === 1 ? "h-11 w-11" : "h-8 w-8"} />
            ))}
            <HouseholdAvatar value={null} className="h-11 w-11" />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <AvatarStack size="sm" people={KIT_PEOPLE.slice(0, 2)} />
            <AvatarStack people={KIT_PEOPLE} />
            <AvatarStack size="lg" people={KIT_PEOPLE} max={3} />
            <MemberAvatar name="Noa" avatarUrl={null} className="h-11 w-11 text-[44px]" />
          </div>
        </Tile>
      </Section>
    </div>
  );
}
