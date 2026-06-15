# Remorra

Remorra is a desktop-first Product Intelligence Platform for non-technical
founders. It guides a product from raw idea to delivery through the DRIVE
framework: Discover, Refine, Initiate, Venture, and Evolve.

## Workspace

- `apps/web`: React and Vite product workspace
- `apps/api`: NestJS modular monolith
- `apps/worker`: asynchronous job worker
- `packages/contracts`: shared Zod API contracts
- `packages/database`: Prisma schema and Supabase migrations
- `packages/ai-core`: portable AI orchestration primitives
- `packages/ui`: shared UI tokens

## Local setup

```bash
pnpm install
pnpm db:generate
pnpm check
pnpm dev
```

Copy each `.env.example` to `.env` before starting the applications. Production
wiring requires Supabase, Anthropic, encryption, and database credentials; it
does not fall back to demo identities or fake AI.

See `docs/PRODUCTION_SETUP.md` for migration, seed, Storage, and hosted
acceptance instructions. Stripe is intentionally deferred.
