# Implementation Status

## Implemented

- Hosted Supabase JWT verification and idempotent profile synchronization
- Prisma production repositories and generated deployment migration
- Project-scoped Founder, Team, and Supplier authorization
- Invitation, consent, and account-state APIs
- Encrypted Discover persistence and queued Anthropic processing
- Refine sessions, proposals, confirmation, Product Pack, and linkage coverage
- Venture cycles, stories, tasks, RAID, finance, meetings, retrospectives, and
  Supplier task restrictions
- Versioned Anthropic skill catalogue with editable V1 defaults
- Viability and Evolve processing through durable jobs
- Five versioned report definitions
- Private Supabase Storage documents and 15-minute signed downloads
- Puppeteer PDF generation with network-isolated templates
- GDPR export, 30-day deletion grace period, cancellation, and final deletion
- pg-boss workers, schedules, retries, attempts, SSE state updates, and outbox
- Platform-role administration for metrics, skills, jobs, retention, knowledge,
  reports, users, and audit evidence
- Complete authenticated React surfaces for customer and admin workflows
- Tenant RLS policies, append-only protections, and active-record constraints

## Verified locally

- Prisma schema validation and client generation
- TypeScript type checks across every workspace
- Unit and contract tests
- Production builds for web, API, worker, and shared packages
- Chromium PDF generation and visual inspection
- No production wiring references in-memory projects, fake identity headers, or
  a fake LLM

## Hosted acceptance blocked by credentials

The current environment does not contain hosted Supabase or Anthropic
credentials. The following checks require those values:

- Applying Prisma and Supabase RLS migrations to the hosted database
- Creating the private Storage bucket
- Running the V1 seed catalogue
- Live signup, confirmation, invitation, and role-switch tests
- Live Anthropic invocation for every skill
- Hosted pg-boss restart and retry verification
- Signed Storage URL expiry verification
- Disposable-user GDPR export and deletion

Stripe remains intentionally deferred.
