# PIN-44 eval results

Generated 2026-10-12 by `eval/cli.ts report`. Ingredient matching by `anthropic/claude-opus-5.5`, blind ranking by `google/gemini-3.1-pro-preview`. Latency is model time per call; $/call is OpenRouter's reported cost (native Gemini estimated from tokens). Candidate spend for this run: $2.6756.

## Text extract (20 posts)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 20 | 0 | 100% | 0.7 s | 0.9 s | $0.00055 | 100% | 98% | 0.3 | 4.8 |
| `mistralai/mistral-small-2603` | 20 | 0 | 100% | 0.7 s | 1.0 s | $0.00085 | 94% | 88% | 0.2 | 4.5 |
| `qwen/qwen3.8-flash` | 20 | 0 | 100% | 1.2 s | 2.0 s | $0.00092 | 99% | 96% | 0.1 | 4.6 |
| `native:gemini-3.1-flash-lite` | 20 | 0 | 100% | 7.8 s | 12.1 s | $0.0027 | 95% | 93% | 0.0 | 4.5 |

## Text extract, Hebrew posts only

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 6 | 0 | 100% | 0.8 s | 0.9 s | $0.00056 | 100% | 95% | 0.3 | 4.8 |
| `mistralai/mistral-small-2603` | 6 | 0 | 100% | 0.5 s | 0.7 s | $0.00097 | 91% | 81% | 0.3 | 4.2 |
| `qwen/qwen3.8-flash` | 6 | 0 | 100% | 1.2 s | 2.0 s | $0.00095 | 96% | 91% | 0.0 | 4.5 |
| `native:gemini-3.1-flash-lite` | 6 | 0 | 100% | 7.6 s | 11.0 s | $0.0028 | 93% | 89% | 0.0 | 4.7 |

## Photo extract (10 cards, 3 handwritten)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5` | 10 | 0 | 100% | 2.8 s | 2.9 s | $0.0200 | 100% | 98% | 0.1 | 4.8 |
| `openai/gpt-6.1-sol` | 10 | 0 | 100% | 1.0 s | 2.2 s | $0.0144 | 100% | 98% | 1.8 | 4.8 |
| `openai/gpt-6-luna` | 10 | 0 | 100% | 1.1 s | 3.4 s | $0.00089 | 100% | 97% | 1.5 | 4.4 |
| `google/gemini-2.5-flash` | 10 | 0 | 100% | 2.9 s | 5.2 s | $0.0066 | 100% | 97% | 0.2 | 4.7 |

## Video extract, video only, no caption (15 Reels)

| model | n | call errors | schema ok | p50 | p95 | $/call | ingredient recall | amount accuracy | extra items/recipe | steps (1–5) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `qwen/qwen3.8-omni-flash` | 15 | 2 | 27% | 62.5 s | 127.7 s | $0.0052 | 51% | 13% | 0.8 | 2.5 |
| `xiaomi/mimo-v2.6-flash` | 15 | 3 | 80% | 5.3 s | 14.5 s | $0.0026 | 39% | 5% | 1.0 | 2.3 |
| `google/gemini-3.5-flash` | 15 | 0 | 100% | 8.0 s | 13.5 s | $0.0264 | 59% | 10% | 0.4 | 2.8 |

## Translate (15 recipes × he/ar/ru)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5@low` | 45 | 0 | 100% | 1.1 s | 1.7 s | $0.0145 | 4.20 | 3.40 | 3.18 | 11% |
| `openai/gpt-6.1-sol@low` | 45 | 0 | 100% | 0.6 s | 0.8 s | $0.0092 | 4.93 | 4.42 | 1.56 | 62% |
| `openai/gpt-6-luna` | 45 | 0 | 100% | 0.6 s | 0.9 s | $0.00044 | 4.71 | 4.04 | 2.24 | 18% |
| `native:gemini-3.1-flash-lite` | 45 | 0 | 100% | 8.4 s | 20.3 s | $0.0019 | 4.31 | 3.76 | 3.02 | 9% |

## Translate, Hebrew only

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5@low` | 15 | 0 | 100% | 1.3 s | 3.2 s | $0.0146 | 4.00 | 3.13 | 3.47 | 0% |
| `openai/gpt-6.1-sol@low` | 15 | 0 | 100% | 0.6 s | 0.9 s | $0.0091 | 5.00 | 4.60 | 1.27 | 80% |
| `openai/gpt-6-luna` | 15 | 0 | 100% | 0.6 s | 1.2 s | $0.00045 | 4.60 | 4.07 | 2.27 | 20% |
| `native:gemini-3.1-flash-lite` | 15 | 0 | 100% | 8.8 s | 10.9 s | $0.0019 | 4.27 | 3.73 | 3.00 | 0% |

## Invent (5 photos, 5 text)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy (1–5) | quality (1–5) | avg rank | ranked #1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `anthropic/claude-sonnet-5.5@low` | 10 | 1 | 90% | 3.0 s | 5.5 s | $0.0249 | 4.11 | 4.44 | 2.44 | 30% |
| `openai/gpt-6.1-sol@low` | 10 | 0 | 100% | 0.6 s | 1.9 s | $0.0157 | 3.70 | 4.60 | 1.90 | 30% |
| `openai/gpt-6-luna` | 10 | 0 | 100% | 0.7 s | 2.7 s | $0.00082 | 3.80 | 4.40 | 2.70 | 20% |
| `google/gemini-2.5-flash` | 10 | 0 | 100% | 2.4 s | 9.1 s | $0.0069 | 3.60 | 4.00 | 2.80 | 20% |

## Content gate (20 food, 10 not)

| model | n | call errors | schema ok | p50 | p95 | $/call | accuracy | food rejected | non-food let through |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `mistralai/mistral-small-2603` | 30 | 0 | 100% | 1.6 s | 2.3 s | $0.00028 | 97% | 1 | 0 |
| `openai/gpt-5.4-nano` | 30 | 0 | 100% | 1.1 s | 2.2 s | $0.00040 | 93% | 2 | 0 |
| `native:gemini-3.1-flash-lite` | 30 | 0 | 100% | 5.2 s | 9.5 s | $0.00035 | 100% | 0 | 0 |

## Extract gate (30 posts, 10 Hebrew)

| model | n | call errors | schema ok | p50 | p95 | $/call | route accuracy | Hebrew accuracy | recipe → no_recipe | full → needs_video |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `jev:typesafe/jev-1.13` | 30 | 0 | 100% | 0.3 s | 1.0 s | $0.00004 | 93% | 90% | 0 | 0 |
| `openai/gpt-6-luna` | 30 | 0 | 100% | 1.1 s | 1.9 s | $0.00006 | 87% | 90% | 0 | 0 |
