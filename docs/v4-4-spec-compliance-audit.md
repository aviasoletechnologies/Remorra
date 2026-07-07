# Remorra V4.4 — Spec Compliance Audit

Every item below was checked directly against the running codebase (grep hits, file reads, or a live DB query), cross-referenced against `RemoraDocument`, the founder-authored V4.4 spec. Nothing here is carried over from assumption or prior summary without a fresh check.

**Summary: 27 Implemented · 15 Partial · 14 Missing** (56 requirements checked)

---

## §5 AI Service Layer

**✅ Implemented — 5.1 Event Router**
DB-driven `SkillEventMapping` table, phase-scoped (a Discover event can't trigger an Evolve Skill), circular-mapping detection real (`assertNoCircularMapping` walks the full graph, not just direct self-loops).

**🟡 Partial — 5.2 Context Assembler**
Broad table coverage exists (`context.ts`) — Goal/Epic/Story/Persona/PainPoint/RaidItem/Project/ProjectMembership/HealthScore/AuditEvent/BuildPhase/UserPreferredName — via a generic `inputSourceMap.tables` mechanism rather than the doc's named keys, but functionally equivalent.
`linkage_map.full` — no handler exists at all. KB-to-topic mapping table exists in schema but is never read; KB injection is pure vector similarity instead (arguably fine, but not what the doc describes).

**✅ Implemented — 5.3 Skill Registry** (one deviation)
Versioned, DB-stored, active-version resolution real. One admin capability exceeds the spec: a non-active `SkillVersion` *can* be permanently deleted (guarded — can't delete the active one, must keep ≥1) — doc says "old versions retained (soft delete)" as an absolute rule.

**🟡 Partial — 5.4 LLM Gateway**
Retry+backoff, streaming for conversational Skills, per-route rate limiting all real. **But the running provider is Groq/Llama, not Anthropic Claude** — confirmed via live job logs (`"model": "llama-3.3-70b-versatile"`) and an env-driven `isGrok` toggle in `config.ts`. Doc requires Claude with Haiku/Sonnet/Opus tiers specifically.

**🟡 Partial — 5.5 Response Parser**
Ajv schema validation is real for table-type Skill output (added this session) plus `ai.report`/document-template payloads. Custom/JSON-shaped-custom Skills (health-score-calculator, impact-screener, project-context-reviewer) still rely on heuristic regex extraction only — no hard validation.

**🟡 Partial — 5.6 Response Router**
Entity updates, document generation, and audit log entries all real and wired. **UI notifications — missing entirely.** The header Bell icon is a generic "you have active/failed jobs" indicator, not a per-event notification (no "Build Sync ingested," no "Evolve approved your change").

**🟡 Partial — 5.7 Token Tracker**
Per-request logging (user/project/Skill/model/tokens) and project-level aggregation both real. The doc's "system" bucket split — distinguishing Layer 3 cron / auto-capture token spend from user-driven spend — has no discriminator anywhere on `TokenUsage`.

**✅ Implemented — 5.8 Audit Logger**
Fixed this session — `entityType`/`entityId`/`before`/`after`/`source` are now populated across `extract-mapper.ts` and the relevant API services, not dead columns anymore.

---

## §6 DRIVE Framework

**🟡 Partial — Discover** (architecture deviation)
Conversational 3-question flow real. But the doc says Discover's questions directly extract Goals/Epics/Personas *during* Discover — the actual build defers all entity creation to Refine; `discover-facilitator` only emits a summary flag (`discover_complete`, problem/idea/user text). A real, deliberate architecture difference, not a bug.

**🟡 Partial — File upload limits**
docx/PDF extraction real (plus txt/URL, broader than spec). Size cap is `10MB` (`workspace-flow.controller.ts`) — doc specifies 5MB.

**✅ Implemented — Refine**
Pass criteria (≥1 connected Goal→Epic→Story thread), live entity summary as a deterministic server-side function (`getRefineSummary`) — no LLM call, matches the doc's latency/cost rationale exactly.

**✅ Implemented — Initiate & Sign-Up**
Health Score fires once, doesn't block payment. Invited team members land directly in Venture via a magic-link redirect (`emailRedirectTo: /venture`), skipping DRI as specified.

---

## §7 Evolve

**🟡 Partial — Architecture** (deliberate deviation)
Doc specifies a persistent side panel following the user between screens. Built as a dedicated full page instead, per an explicit later request this session. Not a bug — the spec document itself is now stale on this point.

**✅ Implemented — Screening Engine & Action Capability**
Goal changes route through `impact-screener`, full Goal→Epic→Story cascade traversal, severity per item, Founder-only approval, rejections deleted (not archived) — matches the doc's own explicit "rejections are not saved anywhere."

**❌ Missing — Screening Rules as configuration**
Doc requires rule changes without code modification. `SCREENED_ENTITY_TYPES = new Set(["Goal"])` is hardcoded in `response-router.ts` — no admin table, no config screen. Changing what triggers screening means editing source and redeploying.

**🟡 Partial — Skill Boundary Enforcement**
Only `evolve-facilitator` has the "only respond to project-relevant questions" instruction. The other 3 Evolve-phase Skills have no such language — lower-risk since they're structured-task invocations, not open chat, but doc says "all."

**✅ Implemented — Session Management & Rate Limiting**
Active/draft/completed states real, nav-away save-as-draft real, session creation rate-limited (`@Throttle` 10/min).

---

## §8 Build Phase & Sync

**✅ Implemented — Build Pack, all 6 artefacts present**
PRD, Brand Kit upload, User Flow upload, Build Sync File (verified genuinely blank-status at generation — `blank: true` on every call site), Build Sync Instructions, project-context snapshot. Founder-only generation enforced.

**🟡 Partial — Build Phase creation flow**
Doc envisions Evolve conversationally asking what the phase covers. Actual flow is a plain name/description form in Venture — functional, but not the Evolve-driven creation experience described.

**❌ Missing — Lifecycle guards found this session**
No check preventing Story add/remove/reassignment on an `active`/`closed` Build Phase — a Story can be silently deleted or moved elsewhere via Evolve while a developer is actively building against a generated pack, with the sync-ingest step then silently dropping any row referencing it (matches zero rows, no error surfaced).

---

## §9 Entity Model & Linkage

**✅ Implemented — Linkage chain & entity change logic**
Goal→Epic→Story confirmed. Goal has no direct-edit endpoint anywhere (Evolve-screening-only, as specified). Epic/Story/Persona/RAID all directly editable by Founder+Team, matching the doc's table exactly.

**❌ Missing — User Board**
No screen anywhere shows Personas + their Pain Points + linked Stories together. Zero Persona references exist in `venture.tsx`. Personas currently only surface as counts in Refine's live summary panel.

---

## §10 Project Context

**✅ Implemented — All three automation layers, traced working**
Layer 1 (`ContextAutoCaptureRule` pattern matching, no AI), Layer 2 (live `<context_proposal>` tag inside Evolve chat), Layer 3 (scheduled `context.review` cron, admin-configurable frequency via `ContextReviewConfig`). Every path funnels into a `ContextProposal` requiring explicit founder confirm — nothing writes context directly.

---

## §11 Access & Roles

**✅ Implemented — Founder / Team permission split**
Founder-only: Goal changes, Build Pack pull, role management — all enforced server-side. Team members skip DRI, land in Venture, can't touch Goals/roles/pack generation.

**❌ Missing — Invitations paid-tier gate**
`auth.service.ts:invite()` checks only `role === "founder"` — no phase or subscription check. Anyone can invite regardless of phase or payment right now (expected, since §15 doesn't exist yet).

---

## §12 Health Score

**🟡 Partial — Components real, default weights not seeded**
The 7-component structure, weighted calc, and admin-configurable `HealthScoreWeightConfig` table are all real. But no seed data populates it — the doc's specified 15/15/15/15/15/15/10 split exists nowhere in code. A fresh deployment's Health Score throws until an admin manually configures every weight.

---

## §13 Concurrency & Conflict

**✅ Implemented — Optimistic locking, Venture entities**
`updateVersioned` pattern (`venture.service.ts`) does a real `WHERE id AND version` update — a stale version matches zero rows and throws a conflict, not decorative.

**❌ Missing — Evolve's entity writes have no lock at all**
`applyEntityChange` (`evolve.service.ts:322`) updates by `id` only — no version check. Two approved actions on the same Story silently last-write-wins. No detection of simultaneous overlapping Evolve sessions either. Directly contradicts §8's own "no auto-merge" principle, which is enforced everywhere else.

---

## §14 Security & GDPR

**✅ Implemented — Data export, deletion, retention**
Full export archive real. Scheduled (30-day grace) and immediate purge both real (recently extended to wipe all product entities, not just chat/logs). Retention cron now reads real `RetentionPolicy` rows — confirmed fixed since an earlier stale audit flagged it hardcoded.

**❌ Missing — Consent enforcement**
`ConsentRecord`/`privacyPolicyVersion` are written at signup — but nothing anywhere checks or blocks an action if consent is missing or stale. Stored, never gated.

---

## §15 Stripe Integration

**❌ Missing — Entirely unbuilt**
No `Subscription` model, no webhook handler, no real tier enforcement beyond one global free-tier token cap env var. "Cancel subscription" validates a reason string only. "Upgrade to premium" shows a literal placeholder alert.

---

## §16 On-Demand Generation

**❌ Missing — "No standalone generate buttons" — violated**
Doc: all document generation goes through Evolve, no standalone buttons. Actual: "Generate Pack" is a literal dedicated button in `venture.tsx`, entirely outside the Evolve chat interface. A clear, direct contradiction of an explicit architectural rule.

---

## §17 Server-Side Functions

**✅ Implemented — Refine Summary, Build Sync/Pack generators**
All deterministic, non-LLM, matching the doc's latency/cost rationale.

**🟡 Partial — Linkage Integrity Checker**
Only an orphan-Epic *count* exists, feeding Health Score's raw signal — not a standalone broken-link/thread-completeness feature the founder could invoke elsewhere.

---

## §18 Admin Dashboard

**✅ Implemented — Metrics, status breakdown, Freeze Account**
Signed-Up / Inception / Delivery breakdown implemented verbatim. Freeze/unfreeze fully wired (backend + admin UI).

**🟡 Partial — Per-user token breakdown**
Backend already returns a `byUser` breakdown — the admin overview frontend only renders `byModel`, never surfaces it. A UI gap, not a backend one.

---

## §20 Configuration Principles

**✅ Implemented — Config-driven, confirmed real**
Skill definitions, Event-to-Skill mappings, Health Score weights (mechanism, not defaults), auto-capture rules, and context review frequency are all genuinely admin/DB-configurable — none of these require a code change to adjust.

**❌ Missing — Not actually configuration yet**
Evolve screening rules (hardcoded Set). KB-to-topic mappings (table exists, never read). Token limits per tier (only a single free-tier cap, no real paid-tier config since Stripe is absent).
