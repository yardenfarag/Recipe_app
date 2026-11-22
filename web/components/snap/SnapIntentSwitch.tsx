"use client";

import { ScanText, Sparkles } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";
import type { SnapIntent } from "@/lib/snap/useSnap";

/**
 * Snap a recipe or Guess the recipe. Two radio buttons, so arrow keys move between them. It looks like the kit's
 * SegmentedControl (components/ui/SegmentedControl.tsx) but keeps its own radios inside labels: the browser tests
 * click the label.
 */
export function SnapIntentSwitch({ value, onChange, disabled }: { value: SnapIntent; onChange: (next: SnapIntent) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const name = useId();
  const options = [
    { value: "extract" as const, label: t("snap.modeExtract"), Icon: ScanText },
    { value: "invent" as const, label: t("snap.modeInvent"), Icon: Sparkles },
  ];
  return (
    <div role="radiogroup" aria-label={t("tabs.snap")} className="inline-flex w-full gap-1 rounded-btn bg-element p-1 sm:w-auto">
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
              checked ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <input
              type="radio"
              data-track={`snap.intent.${option.value}`}
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <option.Icon aria-hidden className={cn("h-4 w-4", checked && (option.value === "invent" ? "text-accent-text" : "text-primary-text"))} />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
