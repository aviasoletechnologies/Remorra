# V4.4 Implementation Audit & Corrected Plan

Source docs read in full: `HARDIK_V4_4_RESPONSES.md`, `RemoraDocument`. Codebase audited file-by-file against both. Phase 1 (entity model reset: Goal/Epic/Story/Persona/PainPoint/RaidItem) is live in the DB. This document is the ground-truth status of everything else, plus the corrected Phase 0-7 plan.

---

## 1. Critical dead code — breaks at runtime today

Phase 1 migration dropped `Ambition, Okr, UserNeed, UserStory, Task, Cycle, DailyMeeting, Retrospective, FinanceCategory, FinanceEntry, BuildPackSnapshot`. The following live (not obviously disabled) code still queries them and will throw:

| File | What breaks |
|---|---|
| `apps/api/src/modules/venture/venture.controller.ts` / `.service.ts` | Whole module — cycles/tasks/finance/meetings/retro all reference dropped tables |
| `apps/api/src/modules/projects/projects.service.ts:102-160` (`getProductPack`) | `prisma.ambition.findMany`, persona `.painPoints`/`.userNeeds` includes |
| `apps/api/src/modules/projects/projects.service.ts:74-95` (`developerExport`) | Calls `getProductPack` → breaks transitively |
| `apps/api/src/modules/projects/projects.service.ts:162-224` (`developerImport`) | `tx.evolveSession.create` / `tx.impactItem.create` — **these models never existed in any version of the schema found**, not even pre-Phase-1. Pure aspirational/leftover code. |
| `apps/worker/src/assemblers/context.ts:5-18` (`projectContext`) | `ambitions`, `personas.userNeeds`, `userStories`, `tasks`, `cycles`, `financeEntries` includes — **still called live** from `document.ts` (`handleSummary`, `handleReport` default path) and `packs.ts` |
| `apps/worker/src/handlers/document.ts:128-137` | `prisma.cycle.findFirst`, `prisma.buildPackSnapshot.create` — fires on every `build-pack` document type |
| `apps/worker/src/handlers/document.ts:243-270` (`handleSummary`) | `prisma.dailyMeeting`/`prisma.retrospective` — entire handler broken |
| `apps/worker/src/services/extract-mapper.ts` (`applyGenericExtractMappings`) | `prisma.ambition`, `prisma.userNeed`, `prisma.okr` — this is the **fallback DB-mapper** that fires whenever a Discover/Refine skill's JSON output has no `operations` key |
| `apps/worker/src/assemblers/skills.ts:9` (`ALLOWED_ENTITIES`) | Still `{Project, Persona, PainPoint, UserNeed, Ambition, Okr, UserStory, Task}` — missing `Goal`, `Epic`, `Story`, `RaidItem` entirely |
| `apps/api/src/modules/admin/admin.service.ts:1230-1251` (`getEventTypes`) | Hardcoded old table list for admin event-mapping UI dropdown — stale labels, not a crash |

**Net effect:** PDF/document generation (except `chat-report`), meeting/retro summaries, product/founder/investor-pack, and the entity-extraction fallback mapper for Discover/Refine are all currently broken against the live schema.

**Also found — not dead code, a real live bug:** `apps/api/src/infrastructure/project-access.service.ts` and `apps/web/src/pages/team.tsx` reference a `"supplier"` role that **does not exist** in the `ProjectRole` enum (`founder`/`team` only).

---

## 2. AI Service Layer — status vs the 8-component spec

| Component | Verdict | Detail |
|---|---|---|
| **Event Router** (`event-router.service.ts`) | Partial | DB-driven mapping (`SkillEventMapping`) works, fans out to multiple skills correctly. **Circular-routing detection: missing.** Conditions-based filtering **written but commented out** (lines 37-50) — fires unconditionally. Routing decisions logged to console only — **never written to `AuditEvent`**. |
| **Context Assembler** (`context.ts`, `skills.ts`) | Partial | No named keys like `goals.all`/`raid.all` from the doc — instead a generic `assembleContext()` reads whatever tables a skill's `inputSourceMap.tables` config lists (more flexible than the doc's suggestion, but `Goal`/`Epic` aren't in any allowed-entity list yet). `project.team`, `linkage_map.full`, `health_score.current`, `audit.recent`, `user.role` — **all missing**, no equivalent exists. Conversation history for the main skill-pinned path has **no cap at all** (unbounded growth); general-chat fallback caps at last 6 messages only. KB injection (pgvector cosine similarity, adaptive threshold) is real and good — better than the doc expected. `KnowledgeBaseTopicMapping` is write-only, never read at retrieval time. |
| **Skill Registry** | Implemented, duplicated | Two independent "get active version" implementations (`PrismaSkillRegistry` class vs inline query in `skills.ts`) diverge on config sourcing (env-var tier vs DB tier); the formal registry class is dead code in practice since `skills.ts` always passes a `skillOverride`. |
| **LLM Gateway** (`llm.ts`) | Implemented | Anthropic + Grok/Groq, streaming, retry+backoff (429/500/529, ECONNRESET/ETIMEDOUT). **Real bug:** `SkillVersion` has **no `modelTier` column** in schema — every invocation silently falls back to `"standard"` tier regardless of intent; fast/reasoning tiers are unreachable today. Rate limiting: generic HTTP throttling only (100 req/min global, some route overrides) — no LLM-provider-specific rate limiting. |
| **Response Parser** | Partial | Ajv (real schema validation, hard-fail) used only for the `ai.report` job and document-template payloads. The dominant conversational-skill path does **zero schema validation** — heuristic regex JSON extraction only, trusts whatever comes back. A separate hand-rolled `ResponseParser.validate` (required-keys-only, warn-not-throw) exists but is weak. |
| **Response Router** | Implemented, sophisticated | `conversation.ts`'s event-chaining state machine (skill→skill via `SkillEventMapping`, DB-mapper fallback via `extract-mapper.ts`, product-pack SSE push, graceful session-close) is the most mature piece of this layer. |
| **Token Tracker** | Implemented | Real per-request cost calc (`CostConfig` driven, with fallback rates), rich admin aggregation (by model/skill/project/user, usage-spike %). Cap enforcement: free tier only, lifetime cumulative via one global env var — no per-project/per-period caps, no paid-tier ceiling at all. |
| **Audit Logger** (`AuditEvent`) | Under-used | Exactly **one** call site in the whole repo (`PrismaAuditLogger.append`, called once per `AiOrchestrator.invoke`). Only ever logs `eventType: "ai.invoked"` with usage/skill metadata. **`entityType`/`entityId`/`before`/`after` fields exist on the model but are never populated by any code.** Entity mutations (Persona create, etc.) and Event Router routing decisions are **never audited**. (Separate `PlatformAuditEvent` model IS pervasively used for admin actions — ~15 call sites in `admin.service.ts` — but that's a different model for a different purpose.) |

---

## 3. Discover/Refine backend

- **Persona creation from LLM output: implemented** (`extract-mapper.ts` generic mapper, old-shape field names).
- **Goal/Epic creation from LLM output: completely missing.** Zero `.create` calls reference `Goal`/`Epic` anywhere in the repo. They exist only as Prisma models — nothing writes to them from any conversational flow. This is the actual entity chain Refine is supposed to build, and it's unbuilt, not just "using stale tables."
- **Signal-strength tracking / `discover_complete` flag: missing.** No matches anywhere in code for signal-strength, discover_complete, pass_criteria_met, or phase-gating logic.
- **Refine Summary Assembler (server-side, non-LLM): missing** as a dedicated concept. Closest analog is `assembleProductPackData` in `packs.ts` — a generic pack exporter, not phase-specific, not wired to any gating logic, and itself dead-code-adjacent (built on `projectContext()`).
- **Phase-transition gating: missing.** `Project.phase` is a plain enum interpolated into prompt text — nothing reads it to block/allow a transition.

---

## 4. Invitation system

- Token validation, expiry, acceptance flow: **implemented** (`auth.service.ts`, SHA-256 token hash, 7-day expiry, transactional membership upsert).
- **Holding screen for team member during founder's DRI: missing.** No pending/approval state exists — acceptance is immediate and unconditional. Frontend (`invitation-accept.tsx`) shows "Open workspace" immediately.
- **Auto-grant-on-founder-payment: missing** — expected, since no Subscription/Stripe code exists anywhere yet (confirmed zero hits).

---

## 5. Concurrency / optimistic locking

- Models with a genuine mutable `version` field: `Project`, `Goal`, `Epic`, `Story`, `Persona`, `PainPoint`, `RaidItem`, `FlowRun`.
- **Only one real, working optimistic-lock call site in the entire repo**: `ProjectsService.advance()` (via `prisma-project.repository.ts:87-100`), and it only guards `Project.phase` transitions.
- Reports, admin, gdpr, event-router: all do plain unguarded updates, no version check anywhere.
- The dead `venture` module has the most thorough version-guard pattern in the codebase (`updateVersioned`/`deleteVersioned` helpers) — but it's built against dropped tables, so it's non-functional today. This pattern should be lifted into the live modules.
- No `P2025` (Prisma stale-write) handling exists anywhere as a fallback.

**Verdict:** the doc's "optimistic locking on all mutable entities" requirement is essentially unbuilt outside `Project.phase`.

---

## 6. GDPR / Security

- **Data export: implemented** (`gdpr.service.ts` + `handleGdprExport` worker job) — full archive to Supabase storage, signed URL, 30-day expiry. Minor: archive hardcodes empty stub arrays for `founderPacks`/`productPacks`/`refineSessions`/`evolveSessions`/`viability` — never actually queried.
- **Deletion: partial, two disconnected paths.**
  - Scheduled (30-day grace): `handleGdprDelete` — deletes owned Projects, anonymizes Profile + own ConversationMessages, calls Supabase `deleteUser`.
  - Immediate: `purgeUserData` — hard-deletes JobRecord/JobStreamEvent/Conversation/IdempotencyRecord/AiInvocation/TokenUsage only, doesn't touch Project/Profile/ConsentRecord/DeletionRequest.
  - These two paths don't coordinate — inconsistent state possible if both are triggered.
- **Consent: stored, never enforced.** `ConsentRecord` + `Profile` fields written correctly on signup, but no guard anywhere checks consent before permitting any action.
- **Retention: cron registered but ignores config.** `handleRetention` hard-deletes stale Conversations but uses a **hardcoded** `policyId: "active-conversations"` — it never reads the `RetentionPolicy` table at all, so the admin-configurable retention screen has zero effect on actual behavior. Also gated behind `ENABLED_QUEUES` env var, which defaults to excluding it.

---

## 7. Reports/Documents

**Solid — fully wired, nothing dead here except its dependency on `projectContext()`/`packs.ts` (already flagged above).** Puppeteer PDF generation, DocumentTemplate versioning, Supabase blob storage, three trigger paths (report-driven, direct document, chat-triggered) all converge correctly on the same render pipeline.

---

## 8. Admin Dashboard

Confirmed **fully missing**: Freeze Account. `ProfileStatus` enum only has `active | deletion_pending | deleted` — no `suspended`/`banned`/`frozen` value exists at all, no endpoint mutates it.

Half-built: `getUsageMetrics()` already returns a `byUser` token breakdown from the API — but `admin-overview.tsx` frontend **never renders it** (only shows `byModel`). Phase 7's "per-account token usage" needs a UI table, not new backend aggregation. No `source`/`system` discriminator on `TokenUsage` exists — the system-bucket split (Layer 3 cron, auto-capture) is genuinely net-new work.

Also found: `admin-flow-builder.tsx` exists fully coded on disk but is never imported anywhere — orphaned page.

Everything else (skill/KB/template/cost-config CRUD, event mapping CRUD, job retry, support workspace with redacted diagnostics + break-glass audit logging) is implemented and solid.

---

## 9. Corrected Implementation Plan

### Phase 0 — Cleanup (do first, blocks everything else) — ✅ DONE (2026-07-01)

1. ✅ Fix/rewrite `projects.service.ts`: `getProductPack`, `developerExport` against Goal/Epic/Story/Persona. **Scrap `developerImport()` entirely** (per decision — dead code assuming a schema shape that never existed; rebuild any "developer changes import" feature later against the real Phase 4 EvolveSession/ImpactItem schema if still wanted).
2. ✅ Fix or delete `projectContext()` in `context.ts`; rewire `packs.ts`/`document.ts` off it.
3. ✅ Fix `document.ts`'s `build-pack` branch (remove `Cycle`/`BuildPackSnapshot` refs) — this folds into Phase 2's real Build Pack work anyway.
4. ✅ Delete `handleSummary` (no meeting/retro entities left) or repurpose entirely.
5. ✅ Update `ALLOWED_ENTITIES` in `skills.ts` to `{Project, Goal, Epic, Story, Persona, PainPoint, RaidItem}`.
6. ✅ Update `admin.service.ts:getEventTypes()` table list to match current schema.
7. ✅ **Build the actual Goal/Epic creation path** in the extract-mapper (currently only Persona works) — required before Refine can produce anything.
8. ✅ Fix or remove the `"supplier"` role references in `project-access.service.ts`/`team.tsx` (role doesn't exist in schema) — extended to `contracts`, `prisma-project.repository.ts`, `reports.service.ts`, `shell.tsx`, `test-kit`.
9. ✅ Rewrite dead `venture.controller.ts`/`.service.ts`/`.tsx` around Story/Goal/Epic/RaidItem (feeds directly into Phase 2's Venture screens).

Also fixed during Phase 0 (found during full sweep, not in original scope): `handlers/gdpr.ts`'s `handleGdprExport` (GDPR export job queried dropped tables — legally-required feature was crashing), `admin.tsx`'s duplicate `ALLOWED_TABLES` hardcoded list (Skill input/output config UI wasn't showing Goal/Epic/Story), live `GENERAL_CHAT_SYSTEM_PROMPT` text (AI was telling users it handles "ambitions & OKRs"), and a full field-name rename of the Product Pack DTO (`ambitions/okrs/objective/userNeeds` → `goals/epics/title/linkedStories`) across contracts + worker + api + frontend, replacing an earlier compat-shim decision once it became clear it wasn't "a proper code change."

### Upstream sync (pulled 2026-07-01) — DRIVE phase-gating landed independently

While Phase 0 was in progress, 9 commits landed on `origin/Dev` implementing DRIVE phase-gating infrastructure — merged in cleanly (one conflict in `shell.tsx`, resolved). This changes Phase 4a's scope:

- **`PhaseGuard`** (`apps/api/src/shared/phase.guard.ts`) + `@RequirePhase(...)` decorator — NestJS guard blocking API routes unless `project.phase` matches. Applied to `VentureController` (`venture`, `evolve` only).
- **`PhaseRoute`** (`apps/web/src/components/phase-route.tsx`) — frontend route guard, redirects to the correct phase home if the project isn't in an allowed phase for that screen. Wired into `app.tsx` for `/workspace`, `/initiate`, `/venture`.
- **Sequential phase enforcement** — `ProjectsService.advance()` now rejects any phase jump that isn't `PHASE_ORDER[i] → PHASE_ORDER[i+1]` (discover→refine→initiate→venture→evolve only, no skipping).
- **Event Router now phase-scopes mappings** — `EventRouterService.route()` filters `SkillEventMapping` by `skill.phase === project.phase`, not just `eventType`/`active`. This **directly satisfies** the HARDIK doc Part 1 requirement ("A Discover event cannot trigger an Evolve Skill") that was flagged MISSING in the audit — **removed from Phase 4a's task list below**. Circular-mapping detection and audit-logging of routing decisions are still missing (unchanged).
- **`Skill.phase` is now a real, populated field** — `seed.ts` seeds 6 canonical Skill IDs with phase assignments: `discover-facilitator` (discover), `refine-facilitator` (refine), `health-score-calculator` (initiate), `evolve-facilitator`/`document-generator`/`impact-screener` (venture). **Metadata only — no `SkillVersion` rows yet, so none of these are invokable until an admin authors a system prompt via the admin UI.** Useful reference for the exact Skill IDs Phase 2-4's Event Router config should target.
- **Admin UI** — Event Routing Configuration restructured into per-phase tabs, Skills table shows/filters by `DRIVE Phase`.
- **Naive "Continue" button** (`ai-workspace.tsx`) — floating button advances phase when `conversation.activeSkill === null && messages.length > 0`. **This is a placeholder, not the real gating logic.** HARDIK doc Q10 requires phase completion to be judged by the Skill's own output flag (`discover_complete: true` / `pass_criteria_met: true`), not "the skill chain happened to stop." Replacing this heuristic with real flag-driven gating stays in Phase 4a's scope below.

### Phase 4a — Session-scoping refactor (before Phase 4 screening work)

- Replace `workspace-flow`'s single hardcoded `kind: "workspace"` conversation with phase-scoped sessions: Discover/Refine get one resumable active session per phase per project; Evolve gets its own `EvolveSession` model (active/draft/completed, `launchedFrom`, multiple sessions, history).
- Add `modelTier` column to `SkillVersion` (currently missing — silent "standard"-only bug, blocks fast/reasoning tier routing).
- Wire Event Router decisions + extract-mapper entity writes into `AuditEvent` (populate `entityType`/`entityId`/`before`/`after` — currently dead columns).
- Add circular-mapping detection to Event Router at config-write time (phase-scoping now handles cross-phase misfires, but same-phase A→B→A loops are still unguarded).
- Re-enable or deliberately drop `conditions` filtering on `SkillEventMapping` (currently disabled, decide intentionally).
- Extend optimistic-locking pattern (lifted from dead venture code) to Story/Epic/Goal/Persona/RaidItem mutation endpoints — currently only `Project.phase` is guarded.
- Replace the naive "Continue" button heuristic (`activeSkill === null && messages.length > 0`) with real `discover_complete`/`pass_criteria_met` flag-driven gating per HARDIK doc Q10 — Discover Facilitator and Refine Facilitator Skills need to emit these flags in their output, and `advance()`/`PhaseRoute` need to check them instead of trusting the frontend button.
- Author `SkillVersion` rows (system prompt + `inputSourceMap` + `outputSchema`) for the 6 seeded Skill IDs (`discover-facilitator`, `refine-facilitator`, `health-score-calculator`, `evolve-facilitator`, `document-generator`, `impact-screener`) — currently metadata-only, none are invokable yet.

### Phase 2 — Build Phase + Build Sync

```prisma
model BuildPhase {
  id          String    @id @default(uuid()) @db.Uuid
  projectId   String    @db.Uuid
  name        String
  description String?
  status      BuildPhaseStatus @default(draft)   // draft/ready/active/closed
  version     Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  stories     Story[]
  pack        BuildPack?
  syncUploads BuildSyncUpload[]

  @@index([projectId])
}

// Story (modify existing model)
model Story {
  ...
  buildPhaseId String?     @db.Uuid   // one active Build Phase at a time
  buildPhase   BuildPhase? @relation(fields: [buildPhaseId], references: [id])
}

model BuildPack {
  id                            String    @id @default(uuid()) @db.Uuid
  buildPhaseId                  String    @unique @db.Uuid
  status                        ReportStatus @default(queued)
  prdDocumentId                 String?   @db.Uuid
  brandKitObjectId              String?   @db.Uuid
  userFlowObjectId              String?   @db.Uuid
  buildSyncFileObjectId         String?   @db.Uuid
  buildSyncInstructionsObjectId String?   @db.Uuid
  projectContextSnapshot        Json?
  createdAt                     DateTime  @default(now())
  completedAt                   DateTime?
  buildPhase                    BuildPhase @relation(fields: [buildPhaseId], references: [id], onDelete: Cascade)
}

model BuildSyncUpload {
  id                   String    @id @default(uuid()) @db.Uuid
  buildPhaseId         String    @db.Uuid
  uploadedById         String    @db.Uuid
  storageObjectId      String    @db.Uuid
  buildPhaseIdentifier String
  status               JobStatus @default(queued)
  ingestedAt           DateTime?
  createdAt            DateTime  @default(now())
  buildPhase           BuildPhase @relation(fields: [buildPhaseId], references: [id], onDelete: Cascade)
}
```

Worker: `build-pack.generate` (assembles 6 artefacts → PDF), `build-sync.ingest` (validate identifier first, reject unknown BuildPhase, map statuses), `build-sync.export` (callable anytime, not just at pack generation).

API:
```
POST /projects/:id/build-phases
POST /build-phases/:id/stories        // sets Story.buildPhaseId
POST /build-phases/:id/pack/generate
POST /build-phases/:id/sync/upload
GET  /build-phases/:id/sync/export
```

### Phase 3 — Health Score

```prisma
model HealthScore {
  id                  String   @id @default(uuid()) @db.Uuid
  projectId           String   @db.Uuid
  overallScore        Int
  readinessAssessment String
  calculatedAt        DateTime @default(now())
  skillVersionId      String   @db.Uuid
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  skillVersion        SkillVersion @relation(fields: [skillVersionId], references: [id])
  components          HealthScoreComponent[]
}

model HealthScoreComponent {
  id            String      @id @default(uuid()) @db.Uuid
  healthScoreId String      @db.Uuid
  component     String      // problem_top/idea_top/user_top/problem_detail/idea_detail/user_detail/cohesion
  weight        Int
  score         Int
  rationale     String
  actions       Json
  healthScore   HealthScore @relation(fields: [healthScoreId], references: [id], onDelete: Cascade)
}
```

No delta field — fires once at Initiate, no recalculation in Venture.

Worker: `health-score.calculate` — deterministic raw sub-score computation → Health Score Calculator Skill (LLM) → stores result.

API:
```
GET  /projects/:id/health-score
POST /projects/:id/initiate   // triggers score calc + advances project.phase
```

### Phase 4 — Evolve + Screening + Action Capability

```prisma
model EvolveSession {
  id             String   @id @default(uuid()) @db.Uuid
  projectId      String   @db.Uuid
  conversationId String   @db.Uuid
  launchedFrom   String
  topic          String?
  status         SessionStatus   // active/draft/completed
  startedAt      DateTime @default(now())
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  impactItems    ImpactItem[]
  actions        EvolveAction[]

  @@index([projectId, status])
}

model ImpactItem {
  id          String   @id @default(uuid()) @db.Uuid
  sessionId   String   @db.Uuid
  entityType  String
  entityId    String?  @db.Uuid
  description String
  severity    String   // red/amber/green
  status      ProposalStatus @default(pending)  // pending/confirmed only — rejects are deleted, never persisted
  createdAt   DateTime @default(now())
  session     EvolveSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model EvolveAction {
  id          String   @id @default(uuid()) @db.Uuid
  sessionId   String   @db.Uuid
  actionType  String   // create_story/create_raid/generate_doc/update_entity
  payload     Json
  status      ProposalStatus @default(pending)  // pending/confirmed/rejected
  createdAt   DateTime @default(now())
  confirmedAt DateTime?
  session     EvolveSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}
```

Worker: `evolve.screen` — Impact Screener Skill on Goal change, creates ImpactItem rows (pending only).

API:
```
POST /projects/:id/evolve/sessions          // rate limited
PUT  /evolve/sessions/:id/status
GET  /projects/:id/evolve/sessions          // history, grouped by topic/launched-from
POST /evolve/sessions/:id/screening/submit
POST /evolve/sessions/:id/screening/items/:itemId/decision   // approve → confirmed; reject → row deleted
POST /evolve/sessions/:id/actions/propose     // action capability
POST /evolve/sessions/:id/actions/:actionId/confirm
```

Founder-only gate on Goal screening decisions.

### Phase 5 — Stripe + Tier Enforcement

```prisma
model Subscription {
  id                   String   @id @default(uuid()) @db.Uuid
  projectId            String   @db.Uuid
  stripeSubscriptionId String   @unique
  stripeCustomerId     String
  status               String
  currentPeriodEnd     DateTime
  cancelledAt          DateTime?
  cancelReason         String?
  tier                 String
  roleCount            Int      @default(1)   // seats — £99 base + £49/extra
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  events               SubscriptionEvent[]
}

model SubscriptionEvent {
  id             String   @id @default(uuid()) @db.Uuid
  subscriptionId String   @db.Uuid
  eventType      String
  stripeEventId  String   @unique
  payload        Json
  createdAt      DateTime @default(now())
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
}

// Profile — add stripeCustomerId String?
// Project — add subscriptionStatus String?
```

API:
```
POST   /stripe/webhooks
POST   /projects/:id/subscription
DELETE /projects/:id/subscription   // mandatory cancel reason
GET    /projects/:id/subscription
```
Paywall middleware on all Venture/Evolve endpoints.

Worker: token limit check in Event Router (free cap vs paid pool). On `subscription.created`/`renewed`: grant Venture access to pending accepted-but-waiting team-member Invitations (closes the holding-screen gap), notify them.

Note: existing `Profile.tier` (per-user) becomes redundant once Subscription (per-project) is source of truth — deprecate or keep read-only, confirm before touching.

### Phase 6 — Project Context Automation

```prisma
model ProjectContextProposal {
  id         String   @id @default(uuid()) @db.Uuid
  projectId  String   @db.Uuid
  sessionId  String?  @db.Uuid
  suggestion String
  source     String   // layer1/layer2/layer3
  status     ProposalStatus @default(pending)
  createdAt  DateTime @default(now())
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

Worker: Layer 1 (entity-pattern hook) creates a proposal — **no direct write**, founder confirms same as Layer 2/3. Layer 2 (post-Evolve session hook). Layer 3 (scheduled cron scanning AuditEvent + entities vs project.context).

API: `POST /projects/:id/context/proposals/:id/decision`

### Phase 7 — Admin Dashboard

```prisma
// Project — add frozen Boolean @default(false), frozenAt DateTime?
```

API:
```
GET    /admin/metrics   // add "system" token bucket for Layer 3 cron / Layer 1 auto-capture cost
POST   /admin/projects/:id/freeze
DELETE /admin/projects/:id/freeze
```
Plus: wire the already-existing `byUser` token breakdown into `admin-overview.tsx` (backend already returns it, frontend never renders it).

---

## 10. Priority order

| Phase | Dependency | When |
|---|---|---|
| 0 — Cleanup | none | Now, first |
| 4a — Session refactor | Phase 0 | Right after 0 |
| 2 — Build Phase | Phase 0 | Parallel with 3 |
| 3 — Health Score | Phase 0 | Parallel with 2 |
| 4 — Evolve/Screening/Actions | Phase 4a, 2+3 | After 2+3 |
| 5 — Stripe | Phase 4 (paywall gates Venture) | After 4 |
| 6 — Context Automation | Phase 4 (needs Evolve sessions) | After 4 |
| 7 — Admin | Phase 5 (needs revenue data) | After 5 |
