# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Backend changes (migrations, Edge Functions)

Production is the only Supabase project; there is no staging (a cost decision, so don't propose one). Merging to `master` deploys migrations and every function through `.github/workflows/deploy-backend.yml`.

- Deploy only by merging. Hand the user a PR instead of running `supabase db push`, `supabase functions deploy`, MCP `apply_migration` or migration SQL against production.
- Before merging, test with one of the paths in `supabase/README.md` → "Testing backend changes": local Supabase (the default), a `-preview` function for changes that need real data, or provider sandboxes for webhooks. Tell the user which one you used.
- Write migrations expand-then-contract, with a timestamp newer than every existing one.

# Onboarding

**Cookie tour**: `docs/onboarding/index.html` is the developer guide (architecture, AI model per task, local setup, workflow). When asked for the "cookie tour", open it in the user's browser (`open` on macOS, `start` on Windows, `xdg-open` on Linux) and offer to walk through it.
