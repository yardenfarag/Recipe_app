# LLM eval results

Generated 2026-11-23 by `eval/cli.ts report`. Ingredient matching by `anthropic/claude-opus-5.5`, blind ranking by `google/gemini-3.1-pro-preview` and `anthropic/claude-opus-5.5` (each case ranked by both; "avg rank" pools them). Latency is model time per call over every run, `--repeat` runs included; $/call is OpenRouter's reported cost from the first run. Candidate spend for this run: $8.2551.

## Text extract (20 posts)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 20 | 0 | 100% | 5.5 s | 10.6 s | $0.00055 | 100% | 96% | 0.5 | 4.8 |
| `qwen/qwen3.8-flash` | 20 | 0 | 100% | 16.1 s | 33.6 s | $0.00093 | 98% | 95% | 0.1 | 4.6 |
| `anthropic/claude-haiku-5.5` | 20 | 0 | 100% | 5.2 s | 8.3 s | $0.0011 | 95% | 94% | 0.1 | 4.7 |
| `meta/muse-ember@low` | 20 | 0 | 100% | 3.9 s | 5.5 s | $0.0012 | 98% | 95% | 0.2 | 4.8 |
| `tencent/hy4-flash` | 20 | 5 | 75% | 4.6 s | 11.8 s | $0.00026 | 63% | 58% | 0.2 | 4.9 |
| `deepseek/deepseek-v4.1-flash-1017` | 20 | 7 | 65% | 4.2 s | 17.6 s | $0.00069 | 55% | 55% | 0.0 | 4.6 |

## Text extract, Hebrew posts only

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 6 | 0 | 100% | 5.5 s | 10.6 s | $0.00056 | 99% | 91% | 0.5 | 4.8 |
| `qwen/qwen3.8-flash` | 6 | 0 | 100% | 18.2 s | 40.0 s | $0.00096 | 93% | 92% | 0.0 | 4.3 |
| `anthropic/claude-haiku-5.5` | 6 | 0 | 100% | 5.0 s | 16.9 s | $0.0012 | 96% | 96% | 0.0 | 5.0 |
| `meta/muse-ember@low` | 6 | 0 | 100% | 4.2 s | 6.1 s | $0.0013 | 99% | 93% | 0.2 | 4.8 |
| `tencent/hy4-flash` | 6 | 0 | 100% | 5.0 s | 30.1 s | $0.00023 | 70% | 59% | 0.0 | 4.8 |
| `deepseek/deepseek-v4.1-flash-1017` | 6 | 3 | 50% | 3.9 s | 18.1 s | $0.00028 | 32% | 32% | 0.0 | 5.0 |

## Photo extract (10 cards, 3 handwritten)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5` | 10 | 0 | 100% | 19.5 s | 38.1 s | $0.0214 | 100% | 100% | 0.2 | 4.7 |
| `openai/gpt-6.1-sol` | 10 | 0 | 100% | 19.0 s | 30.0 s | $0.0147 | 100% | 97% | 1.9 | 4.7 |
| `anthropic/claude-haiku-5.5` | 10 | 0 | 100% | 11.7 s | 20.7 s | $0.0017 | 100% | 94% | 0.1 | 4.5 |
| `openai/gpt-6.1-terra` | 10 | 0 | 100% | 11.0 s | 17.5 s | $0.0049 | 100% | 99% | 1.0 | 4.9 |
| `google/gemini-4-hydrogen` | 10 | 0 | 100% | 14.6 s | 24.3 s | $0.0199 | 100% | 99% | 0.0 | 5.0 |

## Video extract, video only, no caption (27 posts, 16 Hebrew)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.5-flash` | 27 | 0 | 100% | 57.9 s | 88.0 s | $0.0252 | 69% | 16% | 0.6 | 2.7 |
| `qwen/qwen3.8-omni-flash` | 27 | 0 | 100% | 58.0 s | 73.5 s | $0.0015 | 65% | 14% | 0.6 | 2.7 |
| `google/gemini-4-hydrogen` | 27 | 0 | 100% | 50.4 s | 88.8 s | $0.0204 | 65% | 15% | 0.3 | 2.7 |
| `meta/muse-ember` | 27 | 0 | 100% | 45.2 s | 76.3 s | $0.0014 | 69% | 12% | 0.6 | 2.7 |
| `minimax/minimax-m3.1-flash` | 27 | 1 | 96% | 43.0 s | 79.2 s | $0.0016 | 51% | 10% | 2.2 | 1.8 |
| `nvidia/nemotron-3.5-super-vl` | 27 | 3 | 89% | 38.5 s | 71.2 s | $0.0020 | 40% | 8% | 0.8 | 1.8 |
| `qwen/qwen4-max` | 27 | 1 | 96% | 51.5 s | 85.4 s | $0.0176 | 63% | 11% | 1.1 | 2.6 |

## Video extract, Hebrew posts only

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.5-flash` | 16 | 0 | 100% | 52.5 s | 81.2 s | $0.0265 | 78% | 22% | 0.7 | 2.8 |
| `qwen/qwen3.8-omni-flash` | 16 | 0 | 100% | 58.1 s | 83.3 s | $0.0015 | 73% | 17% | 0.6 | 2.9 |
| `google/gemini-4-hydrogen` | 16 | 0 | 100% | 47.7 s | 129.6 s | $0.0217 | 73% | 20% | 0.4 | 2.9 |
| `meta/muse-ember` | 16 | 0 | 100% | 25.1 s | 98.2 s | $0.0015 | 78% | 16% | 0.8 | 2.9 |
| `minimax/minimax-m3.1-flash` | 16 | 1 | 94% | 53.2 s | 85.1 s | $0.0019 | 53% | 10% | 2.9 | 1.7 |
| `nvidia/nemotron-3.5-super-vl` | 16 | 3 | 81% | 46.1 s | 156.2 s | $0.0021 | 46% | 8% | 1.1 | 1.8 |
| `qwen/qwen4-max` | 16 | 1 | 94% | 58.7 s | 90.9 s | $0.0201 | 71% | 15% | 1.5 | 2.9 |

## Translate (15 recipes × he/ar/ru)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | rank by gemini 3.1 | rank by claude opus | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6.1-sol@low` | 45 | 0 | 100% | 13.0 s | 19.4 s | $0.0112 | 4.88 | 4.36 | 2.72 | 2.89 | 2.56 | 20% |
| `openai/gpt-6-luna` | 45 | 0 | 100% | 6.7 s | 13.2 s | $0.00060 | 4.47 | 3.93 | 3.88 | 3.93 | 3.82 | 4% |
| `openai/gpt-6.2-sol@low` | 45 | 0 | 100% | 9.1 s | 16.6 s | $0.0116 | 4.74 | 4.64 | 2.14 | 2.36 | 1.93 | 43% |
| `openai/gpt-6.1-terra@low` | 45 | 0 | 100% | 10.9 s | 16.6 s | $0.0051 | 4.86 | 4.33 | 2.80 | 2.62 | 2.98 | 19% |
| `google/gemini-4-hydrogen@low` | 45 | 0 | 100% | 13.3 s | 20.9 s | $0.0174 | 4.63 | 4.07 | 3.63 | 3.33 | 3.93 | 13% |
| `anthropic/claude-haiku-5.5@low` | 45 | 0 | 100% | 9.2 s | 14.3 s | $0.0012 | 3.72 | 2.89 | 5.82 | 5.87 | 5.78 | 0% |

## Translate, Hebrew only

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | rank by gemini 3.1 | rank by claude opus | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6.1-sol@low` | 15 | 0 | 100% | 12.4 s | 18.7 s | $0.0110 | 4.77 | 4.30 | 2.87 | 3.00 | 2.73 | 17% |
| `openai/gpt-6-luna` | 15 | 0 | 100% | 5.8 s | 12.8 s | $0.00054 | 4.63 | 4.17 | 3.60 | 3.73 | 3.47 | 0% |
| `openai/gpt-6.2-sol@low` | 15 | 0 | 100% | 9.1 s | 18.5 s | $0.0114 | 4.63 | 4.60 | 2.63 | 2.67 | 2.60 | 37% |
| `openai/gpt-6.1-terra@low` | 15 | 0 | 100% | 11.7 s | 16.9 s | $0.0051 | 4.83 | 4.53 | 2.50 | 2.53 | 2.47 | 33% |
| `google/gemini-4-hydrogen@low` | 15 | 0 | 100% | 13.8 s | 21.3 s | $0.0183 | 4.60 | 4.20 | 3.43 | 3.07 | 3.80 | 13% |
| `anthropic/claude-haiku-5.5@low` | 15 | 0 | 100% | 8.5 s | 14.7 s | $0.0011 | 3.60 | 2.87 | 5.97 | 6.00 | 5.93 | 0% |

## Invent (5 photos, 5 text)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | rank by gemini 3.1 | rank by claude opus | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5@low` | 10 | 0 | 100% | 11.4 s | 15.8 s | $0.0253 | 4.40 | 4.00 | 3.45 | 3.60 | 3.30 | 20% |
| `openai/gpt-6.1-sol@low` | 10 | 0 | 100% | 17.7 s | 31.6 s | $0.0144 | 4.50 | 4.70 | 1.75 | 1.90 | 1.60 | 50% |
| `openai/gpt-6.2-sol@low` | 10 | 0 | 100% | 11.0 s | 19.9 s | $0.0111 | 4.05 | 4.65 | 3.05 | 3.40 | 2.70 | 15% |
| `openai/gpt-6.1-terra@low` | 10 | 0 | 100% | 16.7 s | 22.8 s | $0.0060 | 3.85 | 3.55 | 4.75 | 4.60 | 4.90 | 0% |
| `google/gemini-4-hydrogen@low` | 10 | 0 | 100% | 17.3 s | 21.1 s | $0.0232 | 4.45 | 4.10 | 3.05 | 2.60 | 3.50 | 15% |
| `anthropic/claude-haiku-5.5@low` | 10 | 0 | 100% | 7.9 s | 16.9 s | $0.0015 | 3.25 | 3.75 | 4.95 | 4.90 | 5.00 | 0% |

## Content gate (20 food, 10 not)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy | food rejected | non-food let through |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `mistralai/mistral-small-2603` | 30 | 0 | 100% | 1.6 s | 3.5 s | $0.00029 | 97% | 1 | 0 |
| `openai/gpt-5.4-nano` | 30 | 0 | 100% | 1.7 s | 3.8 s | $0.00040 | 90% | 3 | 0 |
| `anthropic/claude-haiku-5.5` | 30 | 0 | 100% | 2.6 s | 5.1 s | $0.00025 | 100% | 0 | 0 |
| `tencent/hy4-flash` | 30 | 0 | 100% | 3.3 s | 7.5 s | $0.00006 | 97% | 1 | 0 |
| `thinkingmachines/inkling-2-mini` | 30 | 0 | 100% | 1.7 s | 4.8 s | $0.00010 | 100% | 0 | 0 |
| `meta/muse-ember@low` | 30 | 3 | 90% | 2.2 s | 4.5 s | $0.00025 | 90% | 0 | 0 |

## Extract gate (30 posts, 10 Hebrew)

| model | n | call errors | schema ok | p50 | p95 | $/call | route accuracy | Hebrew accuracy | recipe → no_recipe | full → needs_video |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `jev:typesafe/jev-1.13` | 30 | 0 | 100% | 0.3 s | 1.1 s | $0.00004 | 97% | 100% | 0 | 0 |
| `jev:typesafe/jev-1.14` | 30 | 0 | 100% | 0.2 s | 0.5 s | $0.00004 | 93% | 100% | 0 | 0 |
| `jev:openai/gpt-6-luna-decisions` | 30 | 0 | 100% | 0.4 s | 0.6 s | $0.00006 | 100% | 100% | 0 | 0 |
| `openai/gpt-6-luna` | 30 | 0 | 100% | 1.0 s | 1.6 s | $0.00006 | 93% | 100% | 0 | 0 |
