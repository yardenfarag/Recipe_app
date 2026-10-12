# LLM eval (PIN-44)

Reruns the PIN-28 model shortlist on real Pinch inputs through the **production task functions** (`supabase/functions/_shared/*`), with one model pinned per call and no fallbacks. Results feed `docs/research/05-llm-per-task.md`.

## Run

Needs `OPENROUTER_API_KEY`, `GEMINI_API_KEY` and `SCRAPECREATORS_API_KEY` in the repo `.env`. Deno runs through npx.

```bash
deno() { npx -y deno run -A --no-lock --env-file=.env eval/cli.ts "$@"; }
deno fetch            # snapshot posts, videos and Commons images into eval/private/
deno label            # reference answers + gate routes (Claude Opus 5.5)
deno run              # every task × model; add --task=text --models=a,b --limit=3
deno judge            # ingredient matching + blind ranking
deno report           # writes eval/results/summary.md
```

Each step skips work that's already on disk. Pass `--force` to redo it. A full run cost $7.18 on 6 Oct 2026 ($2.67 candidates, the rest references and judges).

## Layout

| Path | In git | What |
|---|---|---|
| `cases/posts.json` | yes | Public post URLs, and the tasks each one is used for |
| `cases/images.json` | yes | Wikimedia Commons files (title + license) for photo, content gate and invent |
| `cases/gate.json` | yes | Extract-gate cases: full post, description-only variant, or a hand-written non-recipe caption |
| `cases/invent.json` | yes | Invent prompts |
| `models.ts` | yes | Shortlist per task. The last entry is what production runs today. `model@low` pins the reasoning effort |
| `private/` | no | Post snapshots, videos, images, reference labels |
| `results/raw/` | no | One JSON per call, holding the output, latency, tokens and cost |
| `results/judge/` | yes | Judge verdicts |
| `results/summary.md` | yes | The tables |

## How each task is scored

- **Text, photo, video extract:** Claude Opus 5.5 writes an answer key from the source text or image. A second Opus call then grades each output ingredient by ingredient (`ok` / `wrong_quantity` / `missing`, plus extra items) and gives the steps a 1–5 score. Video runs **without** the caption or comments, so the score shows what the model gets from the clip alone, measured against the recipe the creator wrote down.
- **Translate, invent:** Gemini 3.1 Pro ranks the outputs blind (shuffled, lettered) and scores accuracy and quality from 1 to 5. A Google judge has no stake in the Anthropic and OpenAI candidates.
- **Content gate:** checked in code against the `food` flag in `images.json`.
- **Extract gate:** checked in code against the Opus route label. The non-recipe captions are hand-labelled.

The code under test is reached through `setEvalHook` in `llmClient.ts`, which is never set in Edge Functions.
