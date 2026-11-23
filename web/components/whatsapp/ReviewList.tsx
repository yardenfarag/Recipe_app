"use client";

import { Coins, Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CandidateKind, ChatExport, RecipeCandidate } from "@shared/lib/whatsappImport";

import { Button, buttonClasses } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Tile, TileLabel } from "@/components/ui/Tile";
import { SelectableCandidateRow, kindLabelKey } from "@/components/whatsapp/CandidateRow";
import { cn } from "@/lib/cn";

type Filter = "all" | CandidateKind;

const KINDS: readonly CandidateKind[] = ["link", "text", "photo"];

/** Where "Get more credits" goes: the credits page, with the packs and the balance. */
export const CREDITS_PATH = "/settings/credits";

/** Ticks or unticks each of `candidates` that can be ticked (not already in the Library). */
export function withAll(selected: ReadonlySet<string>, candidates: readonly RecipeCandidate[], on: boolean): Set<string> {
  const next = new Set(selected);
  for (const candidate of candidates) {
    if (candidate.alreadySaved) continue;
    if (on) next.add(candidate.id);
    else next.delete(candidate.id);
  }
  return next;
}

/**
 * The review list: everything in the chat that may be a recipe, newest first, with a tick box each. Filters by kind
 * (links, written recipes, photos) when the chat has more than one. "Select all" and "Clear" work on what the
 * filter shows.
 */
export function ReviewList({
  candidates,
  chat,
  selected,
  onSelectedChange,
}: {
  candidates: readonly RecipeCandidate[];
  chat: Pick<ChatExport, "readPhoto">;
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const byKind: Record<CandidateKind, number> = { link: 0, text: 0, photo: 0 };
    for (const candidate of candidates) byKind[candidate.kind] += 1;
    return byKind;
  }, [candidates]);
  const kinds = KINDS.filter((kind) => counts[kind] > 0);
  const shownFilter: Filter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const shown = shownFilter === "all" ? candidates : candidates.filter((candidate) => candidate.kind === shownFilter);
  const selectable = shown.filter((candidate) => !candidate.alreadySaved);
  const allOn = selectable.length > 0 && selectable.every((candidate) => selected.has(candidate.id));
  const noneOn = selectable.every((candidate) => !selected.has(candidate.id));

  return (
    <Tile as="section" aria-labelledby="whatsapp-review-heading" className="p-3 sm:p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1.5 pt-1 sm:px-2">
        <h2 id="whatsapp-review-heading" className="text-[22px] leading-tight font-bold text-text">
          {t("whatsappImport.found", { count: candidates.length })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            trackId="whatsapp_import.select_all"
            disabled={selectable.length === 0 || allOn}
            onClick={() => onSelectedChange(withAll(selected, shown, true))}
          >
            {t("whatsappImport.selectAll")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            trackId="whatsapp_import.clear"
            disabled={noneOn}
            onClick={() => onSelectedChange(withAll(selected, shown, false))}
          >
            {t("whatsappImport.clearAll")}
          </Button>
        </div>
      </div>

      {kinds.length > 1 ? (
        <div role="radiogroup" aria-label={t("whatsappImport.found", { count: candidates.length })} className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-2.5 pb-1 sm:px-3">
          <Chip kind="radio" size="sm" selected={shownFilter === "all"} trackId="whatsapp_import.filter.all" onClick={() => setFilter("all")}>
            {t("whatsappImport.kindAll")}
            <span className="tabular-nums opacity-70">{candidates.length}</span>
          </Chip>
          {kinds.map((kind) => (
            <Chip
              key={kind}
              kind="radio"
              size="sm"
              selected={shownFilter === kind}
              trackId={`whatsapp_import.filter.${kind}`}
              onClick={() => setFilter(kind)}
            >
              {t(kindLabelKey(kind))}
              <span className="tabular-nums opacity-70">{counts[kind]}</span>
            </Chip>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col gap-0.5" aria-labelledby="whatsapp-review-heading">
        {shown.map((candidate) => (
          <SelectableCandidateRow
            key={candidate.id}
            candidate={candidate}
            chat={chat}
            selected={selected.has(candidate.id)}
            onToggle={() => {
              const next = new Set(selected);
              if (next.has(candidate.id)) next.delete(candidate.id);
              else next.add(candidate.id);
              onSelectedChange(next);
            }}
          />
        ))}
      </ul>
    </Tile>
  );
}

function GetCreditsLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link href={CREDITS_PATH} data-track="whatsapp_import.get_credits" className={buttonClasses({ variant: "link", className: cn("px-0", className) })}>
      {t("whatsappImport.getCredits")}
    </Link>
  );
}

/** More ticked than credits: the import still runs, in order, until they run out. */
export function NotEnoughCredits({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="note" className={cn("rounded-2xl bg-accent-soft p-3.5", className)}>
      <p className="text-sm leading-relaxed text-text">{t("whatsappImport.notEnoughCredits")}</p>
      <GetCreditsLink className="mt-1" />
    </div>
  );
}

/** More items ticked than credits to import them. */
export const shortOfCredits = (count: number, balance: number | null) => balance != null && count > balance;

/**
 * What the import will cost against the balance, and the button that starts it. `panel` is the side tile on wide
 * screens; `bar` floats above the bottom navigation on phones and tablets, so the button stays in reach.
 */
export function ImportSummary({
  count,
  balance,
  onImport,
  variant,
  className,
}: {
  /** Ticked items: one credit each. */
  count: number;
  /** Credits the cook has; null while loading (the import still runs, the server is the judge). */
  balance: number | null;
  onImport: () => void;
  variant: "panel" | "bar";
  className?: string;
}) {
  const { t } = useTranslation();
  const short = shortOfCredits(count, balance);
  const needed = t("whatsappImport.credits", { count });
  const have = balance == null ? null : t("whatsappImport.balance", { count: balance });
  const button = (
    <Button size={variant === "panel" ? "lg" : "md"} fullWidth={variant === "panel"} trackId="whatsapp_import.start" disabled={count === 0} onClick={onImport}>
      <Download aria-hidden className="h-4 w-4" />
      {t("whatsappImport.import", { count })}
    </Button>
  );

  if (variant === "bar") {
    return (
      <div
        className={cn(
          "sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-4 rounded-[22px] border border-border bg-surface/95 p-2 ps-4 shadow-lift backdrop-blur md:bottom-6",
          className,
        )}
      >
        {/* The whole note about too few credits sits above the list; here, only the balance and the way to more. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm leading-snug" aria-live="polite">
            <p className="font-display font-bold text-text tabular-nums">{needed}</p>
            {have ? <p className={cn("truncate text-[13px]", short ? "font-semibold text-accent-text" : "text-muted")}>{have}</p> : null}
            {short ? <GetCreditsLink className="text-[13px]" /> : null}
          </div>
          {button}
        </div>
      </div>
    );
  }

  return (
    <Tile as="section" aria-labelledby="whatsapp-cost-heading" className={cn("p-5", className)}>
      <TileLabel as="h2" id="whatsapp-cost-heading" className="flex items-center gap-2">
        <Coins aria-hidden className="h-4 w-4 shrink-0 text-accent-text" />
        {t("settings.recipeCredits")}
      </TileLabel>
      <p className="mt-3 font-display text-[34px] leading-none font-bold break-words text-text tabular-nums" aria-live="polite">
        {needed}
      </p>
      {have ? (
        <p className={cn("mt-2 text-[15px]", short ? "font-semibold text-accent-text" : "text-muted")}>{have}</p>
      ) : (
        <p aria-hidden className="mt-2 h-5 w-40 max-w-full rounded-lg bg-element motion-safe:animate-pulse" />
      )}
      {short ? <NotEnoughCredits className="mt-4" /> : null}
      <div className="mt-5">{button}</div>
    </Tile>
  );
}
