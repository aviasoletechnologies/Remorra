# Production Setup

## Required services

1. Create a hosted Supabase project.
2. Create a private Storage bucket named `private-documents`.
3. Obtain an Anthropic API key and select model IDs for fast, standard, and
   reasoning tiers.
4. Deploy separate API, worker, and web services.

## Database

Set `DATABASE_URL`, then run:

```bash
pnpm db:migrate:deploy
pnpm db:seed
```

Apply the SQL files under `packages/database/supabase/migrations` in numeric
order after the Prisma baseline migration. These enable tenant RLS and revoke
direct writes to operational and audit records.

## API and worker

Populate the variables documented in:

- `apps/api/.env.example`
- `apps/worker/.env.example`

`ENCRYPTION_KEY` must be a high-entropy secret stored in the deployment secret
manager. Do not rotate it without a conversation and GDPR archive re-encryption
procedure.

The worker needs a Chromium executable. Set `PUPPETEER_EXECUTABLE_PATH` when the
deployment platform does not expose Puppeteer's downloaded browser.

## Web

Populate `apps/web/.env.example`. The anon key is public by design; service-role
and Anthropic keys must never be exposed to Vite.

## Acceptance

Run:

```bash
pnpm check
```

Then complete hosted signup, invitation, skill, report, PDF, retention, and
GDPR tests using disposable accounts before production launch.
