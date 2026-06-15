# Remorra Architecture

## Runtime shape

Remorra is a pnpm monorepo with three deployable applications:

- `web`: browser workspace
- `api`: NestJS modular monolith
- `worker`: durable asynchronous processing

The API stays a monolith. Business capabilities are modules, and only complex
domains use explicit application/domain/infrastructure boundaries.

## Trust boundaries

- The browser receives public Supabase configuration only.
- The API verifies identity and resolves project role for every project request.
- Anthropic, Stripe service keys, Supabase service role, PDF rendering, and
  privileged writes remain server-side.
- Uploaded documents are untrusted context. They never become system
  instructions and are deleted after extraction.
- AI output is untrusted until schema validation and product-rule validation
  both pass.

## Consistency

- Mutable records carry an integer version.
- Clients send the loaded version through `If-Match`.
- Evolve captures a project base version and commits approved changes in one
  transaction.
- Rejected proposals are removed from the commit payload and do not create
  product-history audit events.

## Adapter progression

Local development intentionally uses in-memory repositories and a fake LLM.
Production adapters implement the same ports with Prisma, Supabase Auth,
Anthropic, Stripe, object storage, and the worker queue.
