# LLM eval (PIN-44)

Reruns the PIN-28 model shortlist on real Pinch inputs through the **production task functions** (`supabase/functions/_shared/*`), with one model pinned per call and no fallbacks. Results feed `docs/research/05-llm-per-task.md`.

## Run

Needs `OPENROUTER_API_KEY` and `SCRAPECREATORS_API_KEY` in the repo `.env` (native Gemini is gone since PIN-45). Deno runs through npx.

```bash
deno() { npx -y deno run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/cli.ts "$@"; }
deno fetch            # snapshot posts, videos and Commons images into eval/private/
deno label            # reference answers + gate routes (Claude Opus 5.5)
deno run              # every task × model; add --task=text --models=a,b --limit=3 --repeat=3
deno judge            # ingredient matching + blind ranking
deno report           # writes eval/results/summary.md
```

Each step skips work that's already on disk. Pass `--force` to redo it. A full run cost $7.18 on 6 Oct 2026 ($2.67 candidates, the rest references and judges). The 23 Nov 2026 bake-off cost about $23 ($8.26 candidates, with repeats and 27 videos); its findings are in `results/bakeoff-2026-11-23.md`.

`--repeat=N` runs each case N times. Runs 2..N are saved as `<case>~rN.json` and only feed the latency columns; scores come from run 1. Latency is the wall clock of the call: llmClient's `durationMs` stops at the response headers, before the body is read, so it undercounts. Video times include uploading the clip from your machine, so compare models with each other, not with production. Keep video `--concurrency` at 2: at 5, uploads of 10–20 MB clips fail with `fetch failed` for every model.

## Appliances (PIN-26)

```bash
deno appliances --runs=3            # 32 Hebrew/English cases through the production appliances task
deno appliances --only=he           # one language; --only=<id part> for single cases; --model=<slug> to try another model
```

Scored in code against hand labels in `cases/appliances.json` (no judge). Writes `results/appliances.md`. Targets are in ADR 017. A 3-run pass costs well under a cent. The scorer has its own tests: `npx -y deno test -A --no-lock eval/appliances_test.ts`.

## Nutrition (PIN-80)

```bash
npx -y deno run -A --no-lock --env-file=.env eval/nutrition.ts   # 6 recipes through the production recipe_estimates task
```

Calories, protein, carbs and fat per serving, scored in code against hand-worked references in `cases/nutrition.json` (no judge). Writes `results/nutrition.md`. One pass costs about $0.0004. Scorer tests: `npx -y deno test -A --no-lock eval/nutrition_test.ts`.

## Translation quality (PIN-53)

```bash
deno translate --runs=2              # 25 hand-written recipes into he/ar/ru/es/en through the production translate task
deno translate --only=he             # one language; --only=<id part> for single cases
deno translate --model=<slug> --tag=x # another model, kept apart from the production files
deno translate --no-judge            # code checks only, no judge call
```

Each answer is rendered the way the recipe screen shows it (unit words, fractions, and step temperatures and sizes in the language's default Metric or US setting). Code checks: untranslated words, the unit repeated in the name, Russian capitals, mixed Hebrew step style, and the hand labels in `cases/translate.json`. Gemini 3.1 Pro then marks errors MQM style (1 point a minor, 5 a major) on run 1. Writes `results/translate.md` (or `results/translate-<model>-<tag>.md`) and judge verdicts under `results/judge/translate-quality/`. A full run costs about $0.50. It stops at once on a 402 from OpenRouter, because production uses the same balance. Scorer tests: `npx -y deno test -A --no-lock --unstable-sloppy-imports eval/translate_test.ts`. Findings and numbers: `docs/research/09-translation-quality.md`.

## Layout

| Path | In git | What |
|---|---|---|
| `cases/posts.json` | yes | Public post URLs, and the tasks each one is used for |
| `cases/images.json` | yes | Wikimedia Commons files (title + license) for photo, content gate and invent |
| `cases/gate.json` | yes | Extract-gate cases: full post, description-only variant, or a hand-written non-recipe caption |
| `cases/invent.json` | yes | Invent prompts |
| `cases/appliances.json` | yes | Appliances cases with hand labels (PIN-26) |
| `cases/translate.json` | yes | Translation cases with hand labels (PIN-53) |
| `cases/nutrition.json` | yes | Nutrition cases with hand-worked references (PIN-80) |
| `models.ts` | yes | Shortlist per task. Production defaults are `TASK_MODELS` in `supabase/functions/_shared/llm/llmClient.ts`. `model@low` pins the reasoning effort |
| `private/` | no | Post snapshots, videos, images, reference labels |
| `results/raw/` | no | One JSON per call, holding the output, latency, tokens and cost |
| `results/judge/` | yes | Judge verdicts |
| `results/summary.md` | yes | The tables |

## How each task is scored

- **Text, photo, video extract:** Claude Opus 5.5 writes an answer key from the source text or image. A second Opus call then grades each output ingredient by ingredient (`ok` / `wrong_quantity` / `missing`, plus extra items) and gives the steps a 1–5 score. Video runs **without** the caption or comments, so the score shows what the model gets from the clip alone, measured against the recipe the creator wrote down.
- **Translate, invent:** Gemini 3.1 Pro and Claude Opus 5.5 each rank the outputs blind (shuffled, lettered) and score accuracy and quality from 1 to 5. Two judges from different vendors, so no candidate is graded only by its own vendor; the report shows each judge's average rank next to the pooled one.
- **Content gate:** checked in code against the `food` flag in `images.json`.
- **Extract gate:** checked in code against the Opus route label. The non-recipe captions are hand-labelled.

The code under test is reached through `setEvalHook` in `llmClient.ts`, which is never set in Edge Functions.
