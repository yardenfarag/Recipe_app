# ADR 019: Partial imports ask the user and are free

**Status:** Accepted
**Date:** 2026-11-09
**Deciders:** Yarden (product)
**Amends:** ADR 004 (partial result row), ADR 012 (what costs a credit)

## Context

An import is **partial** when it finds a title and either ingredients or steps, but not both (`classifyGeminiRecipe`). Under ADR 004 a partial opens in preview with the "The source skipped some details" banner. The user can save it, and it costs one credit, the same as a full recipe. Applying an AI repair costs another credit.

Competitor reviews complain about half-finished recipes (PIN-56). ADR 004 accepted partials partly because users couldn't edit recipes. PIN-79 (ADR 018) has since added hand editing, so users can now fill in the gaps themselves.

Partials are rare. Up to 2026-11-09 there was 1 partial in about 190 imports (ingredients, no steps). It was charged a credit, and its AI repair found nothing to add. Hard failures were about 30 times more common.

## Decision

- **Be honest, don't silently save.** When an import is partial, the app shows a dialog instead of the preview. The dialog names what we couldn't find, for example "We found the ingredients but not the steps." It offers two choices:
  - **Fill it in myself**: opens the recipe editor on the unsaved draft, with the missing section focused.
  - **Cancel**: closes the import. Nothing is saved.
- **The dialog says the credit isn't charged.** A partial import never costs a credit or a guest import, whichever choice the user makes. The extract function refunds the reservation, as it already does for a failed find.
- **The editor works on an unsaved draft.** Nothing is saved until the user presses Save. Backing out saves nothing. Save goes through the normal ADR 018 path (Jev content check, background recalculation), and the recipe keeps its source URL.
- **Save needs both ingredients and steps.** The user chose to fill in the gap, so the editor doesn't save another partial. Imports no longer create partial recipes.
- **Guests are asked to sign up at "Fill it in myself"**, because editing needs an account (ADR 018, sign-up reason `edit`). Cancel works without an account.
- **No AI repair at import time.** Before returning a partial, the extract function already tries the next rung of the content ladder (video after text, ADR 013). A second paid model pass rarely helps; the one real repair found nothing.

## Considered options

- **Keep save-with-banner (ADR 004).** An ingredients list alone has some value, but saving and charging for a recipe you can't cook is what the reviews complain about.
- **Fail and refund.** Honest and simple, but it throws away the part we did find, even though the user could finish it in a minute.
- **Save, but block cooking until repaired.** Adds a gated recipe state across the app for about 0.5% of imports.
- **Save, then open Edit.** Reuses the saved-recipe editor without changes, but backing out leaves a half-finished recipe in the library, which is what we want to avoid.

## Consequences

- The editor needs a draft mode: open from an import result that has no row yet, and create the row on Save. It needs the source URL, platform and extraction source carried through, so duplicate-link checks and Hub rules still apply.
- Free partials give a little free model use. The exposure is the same as for failed finds, which are already free, and the daily AI caps still apply.
- Existing partial rows keep the banner, **Repair recipe** and editing. Invented-recipe partials (the photo or post guesses) keep their own banner and editing. Retiring `repair-recipe` is a separate decision once the old partial rows are gone.
- `ai_usage_events` keeps logging partial imports with `status = 'partial'` and `tokens_charged = 0`, so we can see how often the dialog appears and which choice users make.
