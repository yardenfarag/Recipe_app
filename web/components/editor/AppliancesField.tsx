"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { applianceNameKey } from "@shared/lib/applianceDisplay";
import { APPLIANCE_KEYS, MAX_RECIPE_APPLIANCES, type ApplianceKey } from "@shared/lib/appliances";
import type { ApplianceRow, StepRow } from "@shared/lib/recipeEditor";

import { inputClasses } from "@/components/editor/parts";
import { ChoiceGroup } from "@/components/settings/controls";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

type AppliancesFieldProps = {
  appliances: ApplianceRow[] | null;
  steps: StepRow[];
  onAdd: (key: ApplianceKey) => void;
  onRemove: (key: ApplianceKey) => void;
  onSetRequired: (key: ApplianceKey, required: boolean) => void;
  onToggleStep: (key: ApplianceKey, stepId: string) => void;
};

/**
 * What the recipe needs (ADR 017), each required or optional and linked to the steps that use it. Links follow the
 * steps by id, so reordering steps keeps them right. A new appliance starts linked to every step.
 */
export function AppliancesField({ appliances, steps, onAdd, onRemove, onSetRequired, onToggleStep }: AppliancesFieldProps) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const rows = appliances ?? [];
  const listed = new Set(rows.map((row) => row.key));
  const available = APPLIANCE_KEYS.filter((key) => !listed.has(key));
  const canAdd = steps.length > 0 && rows.length < MAX_RECIPE_APPLIANCES && available.length > 0;

  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">{steps.length > 0 ? t("web.editor.appliancesEmpty") : t("web.editor.appliancesNeedStep")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const name = t(applianceNameKey(row.key));
            return (
              <li key={row.key} className="rounded-2xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{name}</span>
                  <IconButton
                    label={t("a11y.removeItem", { item: name })}
                    icon={<Trash2 className="h-[18px] w-[18px]" />}
                    onClick={() => onRemove(row.key)}
                    className="h-9 w-9 hover:bg-danger-soft hover:text-danger"
                  />
                </div>
                <ChoiceGroup
                  label={name}
                  value={row.required ? "required" : "optional"}
                  onChange={(value) => onSetRequired(row.key, value === "required")}
                  options={[
                    { value: "required", label: t("recipeEditor.appliance.required") },
                    { value: "optional", label: t("recipeEditor.appliance.optional") },
                  ]}
                  className="mt-2 inline-flex rounded-full bg-element p-1"
                  optionClassName="h-8 rounded-full px-3.5 text-sm font-semibold text-muted transition-colors hover:text-text data-[checked]:bg-surface data-[checked]:text-text data-[checked]:shadow-soft focus-visible:outline-2 focus-visible:outline-primary"
                />
                {steps.length > 0 ? (
                  <div role="group" aria-label={`${name}: ${t("web.editor.usedInSteps")}`} className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span aria-hidden className="me-1 text-xs font-semibold text-muted">
                      {t("web.editor.usedInSteps")}
                    </span>
                    {steps.map((step, index) => {
                      const linked = row.stepIds.includes(step.id);
                      return (
                        <button
                          key={step.id}
                          type="button"
                          aria-pressed={linked}
                          aria-label={t("recipeEditor.fields.step", { n: index + 1 })}
                          onClick={() => onToggleStep(row.key, step.id)}
                          className={cn(
                            "grid h-8 min-w-8 place-items-center rounded-full border px-2 text-xs font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                            linked ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-element",
                          )}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" size="sm" className="mt-3" disabled={!canAdd} onClick={() => setPicking(true)}>
        <Plus aria-hidden className="h-4 w-4" />
        {t("web.editor.addAppliance")}
      </Button>
      <AppliancePicker
        open={picking}
        available={available}
        onOpenChange={setPicking}
        onPick={(key) => {
          onAdd(key);
          setPicking(false);
        }}
      />
    </div>
  );
}

/** The catalog, filtered as you type. Enter picks the first match. */
function AppliancePicker({
  open,
  available,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  available: ApplianceKey[];
  onOpenChange: (open: boolean) => void;
  onPick: (key: ApplianceKey) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const named = available.map((key) => ({ key, name: t(applianceNameKey(key)) }));
    named.sort((a, b) => a.name.localeCompare(b.name));
    const q = query.trim().toLocaleLowerCase();
    return q ? named.filter((option) => option.name.toLocaleLowerCase().includes(q)) : named;
  }, [available, query, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent title={t("recipeEditor.appliance.pickTitle")}>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && options[0]) {
                event.preventDefault();
                onPick(options[0].key);
              }
            }}
            aria-label={t("web.editor.searchAppliances")}
            placeholder={t("web.editor.searchAppliances")}
            className={inputClasses(false, "h-11 ps-9")}
          />
        </div>
        <ul className="-mx-2 mt-3 max-h-[50dvh] overflow-y-auto">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => onPick(option.key)}
                className="flex min-h-11 w-full items-center rounded-xl px-3 text-start text-[15px] text-text transition-colors hover:bg-element focus-visible:bg-element focus-visible:outline-2 focus-visible:outline-primary"
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
        {options.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t("web.editor.noApplianceMatch")}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
