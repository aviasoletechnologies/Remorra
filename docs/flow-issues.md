# Flow Issues — Plain Language Reference

34 issues verified against codebase code. No code shown — plain English only.
New issues found in code marked **← NEW**.
Critical issues marked **← CRITICAL**.

---

## 1. `@previous` context empty when first skill runs

**What it is:** Admin sets up a skill to read the output of the "previous skill." But if this skill runs first (nothing ran before it), there is no previous output. System doesn't warn anyone — skill just starts with a blank slate.

**What happens:** Skill runs with no context. LLM guesses or gives generic answers. Output is wrong from the start, and every skill that follows inherits that bad start.

**Real example:** You tell a new employee "summarize the report from the person before you." They arrive first — there is no person before them. Instead of asking for clarification, they write a blank summary and submit it. Everyone downstream works from a blank summary.

**Recommended Fix — one configuration change, solves multiple issues:**

This is the solution to Issue #1, but the same config-time change (explicit named-skill selector replacing the implicit `@previous` keyword) also resolves or de-risks the following issues. Listed here first, explained below.

| # | Issue | How this config solves it |
|---|-------|---------------------------|
| #1 | `@previous` context empty when first skill runs | Core fix — see UI behaviors below |
| #3 | Previous skill ID never checked for ownership | Solved by construction — dropdown only lists project-scoped skills |
| #7 | Circular routing → infinite loop | Solved by construction — explicit named links form a real graph, walkable for cycles at save time |
| #29 | `@previous` + other skills drops all other skills | Solved by construction — no more magic keyword to special-case |
| #2 | Wrong previous skill output across sessions | Risk reduced — UI clarifies intent, but still needs separate `conversationId` scoping fix |
| #30 | Latest structured extract fetched regardless of creator | Risk reduced — UI clarifies intent, but still needs separate `skillId` filter fix |

**Three UI behaviors, two screens:**

**1. Skill Add/Edit screen — "Previous Skill Output" checkbox:**
When Admin checks this box, system fetches the Event Mapping config and checks: is this skill configured as the *next skill* target in any existing mapping?
- If **yes** → show only the source skill's **name** under the checkbox (not its output content) — just enough for Admin to confirm which skill feeds this one.
- If **no** → show a warning: "This skill isn't set as a next-step in any event mapping yet — previous skill output will be empty at runtime."
No output preview shown here — name only, pulled live from event mapping config.

**2. Event Mapping Settings screen — DB-output skill warning:**
When Admin configures a mapping (source skill → completed event → next skill), system checks if the *source* skill has a table/JSON output config (i.e. it's a DB-write/mapper-type skill rather than conversational).
- If so, and Admin is wiring it to a "skill completed" event → show a **non-blocking warning**: "This skill writes directly to the database — consider routing via a database event instead of a skill-completed event." Admin can still save as-is; this is advisory, not enforced.

**3. Previous Skill Output checkbox — runtime mismatch warning:**
Combine #1 and #2: if a skill has "previous skill output" checked, but the actual configured source (per event mapping) is a DB-output-only skill, show a warning directly under the checkbox in the skill edit screen: "Flow not properly configured — source skill produces database output, not a readable previous-skill output. This will be empty at runtime."

**Feasibility:** Easy-medium — all three are config-time UI warnings reading existing event-mapping and skill-output-type data; no runtime behavior change required, just visibility before Admin saves a broken config.

**Fetching output from multiple selected skills:** Admin's selection list (e.g. ticks Skill A and Skill B as sources) is saved directly as the skill's config — `sourceSkills: [A, B]`. At runtime, system loops through that saved list and fetches each skill's latest output (scoped to current conversation, per issue #2's fix), then combines all of them into context, labeled by skill name. No special-casing any one source over another — every skill in the list gets fetched, every time. Admin doesn't need to know in advance what a skill's output looks like — the dropdown preview (behavior #1 above) shows a live sample at config time, and the runtime fetch just pulls whatever was last saved.

**#3 — why solved:** Dropdown only ever lists skills belonging to the current project, so a wrong/cross-project skill ID can't be selected in the first place. No separate runtime ownership check needed for this path.

**#29 — why solved:** Replacing the magic `@previous` keyword with an explicit multi-select of named skills removes the ambiguity entirely — Admin picks all source skills by name, there's no "previous" special-case left to silently override the rest.

**#2 — why only de-risked:** UI now makes it unambiguous *which skill* Admin intended as the source, but the runtime fetch still needs the separate fix (scope lookup by `conversationId`, not just `skillId + projectId`) to pull the *right session's* output from that skill.

**#30 — why only de-risked:** Same pattern: UI clarity on intended source skill doesn't change the backend query, which still needs to filter the extract lookup by `skillId` specifically.

**#7 — why solved (config-time cycle detection):** Once skill links are explicit names instead of the implicit `@previous` keyword, the whole chain becomes a real graph — Skill A → Skill B → Skill C. That graph can be walked at config-save time to detect cycles before they're ever saved, in two places:
- **Previous-skill-output selection:** if Admin tries to select Skill A as a source for Skill B, and Skill A already lists Skill B as ITS source, block save with "Circular reference: Skill B already depends on Skill A."
- **Event mapping graph (Skill → completed event → next skill):** when Admin saves a mapping, walk the chain forward — if it loops back to a skill already in the chain, block save with "This creates a loop: A → B → A." Keep the existing runtime hop-counter as a safety net, but this stops bad config from being saved in the first place.

---

## 2. Wrong previous skill output given to next skill

**What it is:** When fetching the "previous skill's output," system grabs the most recent output for that skill type across the entire project — not the one from the current conversation thread.

**Where this actually applies (verified against code):** Confirmed against `schema.prisma` and `workspace-flow.service.ts`. The **workspace chat** is a single ongoing conversation per project — `loadConversation()` always reuses the one `status: active` conversation, never creates a second one. So a "Monday vs Friday" scenario as two separate conversations does NOT happen in workspace chat.

It DOES happen in **Evolve**. Schema has `ConversationKind: discover/refine/evolve/workspace` and `SessionStatus: active/draft/screening/completed/nav_away` — Evolve explicitly supports multiple sessions existing at once (PRD section 7: Active, Draft, Completed, session history). Founder can have a Draft from last week sitting unresolved while starting a brand new Evolve session today — two real, separate `Conversation` rows, same project, same skill possibly used in both.

**What happens:** The lookup in `context.ts` does `where: { conversation: { projectId }, skillId }, orderBy: createdAt desc` — searches across **every conversation in the project**, not scoped to the conversation currently running. If two Evolve sessions are open at the same time (two tabs, or a resumed Draft alongside a new session), and Skill X ran in Session A, then Session B asks "give me Skill X's output" — it can grab Session A's record instead of its own, purely because Session A's message has a later timestamp. The "today vs yesterday" framing was wrong; the real trigger is **concurrent or overlapping Evolve sessions**, not same-day reruns.

**Real example:** Founder has a Draft Evolve session open from last week (unfinished) and starts a brand new Evolve session today on a different topic. Both used the "Persona Analysis" skill. Today's session asks for that skill's last output — query has no session boundary, so it can pull last week's Draft data into today's fresh session instead of today's own (or nothing at all, if today's hasn't run that skill yet).

**Recommended Fix:** Scope the lookup by the current `conversationId`, not project-wide `skillId` only. **Easy.**

---

## 3. Previous skill ID never checked for ownership

**What it is:** The system trusts whatever "previous skill ID" it receives in the job without verifying it belongs to the same project or flow.

**What happens:** If a wrong or outdated ID is passed, system looks for output from a skill that may not exist in this project. Finds nothing. Continues silently with empty context.

**Real example:** A warehouse worker is told "get the inventory report from Bay 3." The Bay 3 label was wrong — it belongs to a different warehouse. Worker goes, finds nothing, returns empty-handed. Work continues without the data. Nobody checks if the right warehouse was visited.

**Recommended Fix:** Verify the previous skill belongs to the same project/conversation before using it; reject mismatch. **Easy.**

---

## 4. Wrong table columns selected → extractor links records wrong

**What it is:** Admin selects which columns from the database to pass to the LLM. If they forget to include ID columns, LLM sees data without being able to link it to existing records.

**What happens:** Extractor creates duplicate records instead of updating existing ones. Database gets polluted with doubles.

**Real example:** You hand a new accountant a list of client names but no account numbers. They receive payment for "John Smith" — but there are three John Smiths. They create a new account instead of crediting the right one. Three John Smiths become four.

**Recommended Fix:** Force-include the ID column always, regardless of Admin's column selection. **Easy.**

---

## 5. Wrong entity name in LLM output → record silently not saved

**What it is:** LLM must output the exact entity name that matches the database model. If it outputs a slightly wrong name (plural vs. singular, different capitalization), system quietly skips saving that record.

**What happens:** Records that should be created never appear in database. Flow continues like nothing happened. No error shown anywhere.

**Real example:** A form needs the field labeled exactly "Pain Point." LLM writes "Pain Points" (plural). System checks, finds no field called "Pain Points," silently ignores it. The user's pain points are never saved. Next skill looks for them and finds nothing.

**Recommended Fix:** Fuzzy/case-insensitive match against known entity names; if still no match, fail loud with the list of valid names in the error. **Easy.**

---

## 6. No event mapping set up → flow stops with fake success message

**What it is:** When a skill finishes, system checks if Admin configured a "what happens next" rule. If no rule exists, it shows users a "Great work, all done!" message even though the flow was never meant to end there.

**What happens:** Flow silently dead-ends. Admin doesn't know routing was never configured. Users think they're done but actually nothing happened after that skill.

**Real example:** A customer fills out a survey. The survey submission goes to a black hole because the "send to analysis team" step was never wired up. Customer sees "Thank you, we got your response!" The analysis team never receives it.

**Recommended Fix:** If no mapping configured, surface "flow not configured" to admin logs/alert — never show a fake success message to the user. **Easy.**

**Feeds into issue #28's fix:** This warning is only useful if Admin actually sees it. Write it to the same `JobStreamEvent`/audit log that #28's Admin error feed reads from — #6 produces the signal, #28 builds the dashboard that displays it. Build both together, not separately.

---

## 7. Circular routing → infinite loop ← CRITICAL

**What it is:** Admin can accidentally create a rule that says "when Skill A finishes, start Skill A again." System has no protection against this.

**What happens:** Skill runs, finishes, starts itself again, finishes again, starts again — forever. Server burns resources. Costs accumulate. Nothing useful is produced.

**Real example:** You set a rule: "After the morning report is written, write the morning report." The system writes a report, then immediately starts writing another report, then another. It never stops until someone manually intervenes or the server crashes.

**Primarily solved by issue #1's fix.** Once skill links are explicit named selections (not the implicit `@previous` keyword), the event-mapping chain becomes a real graph that can be walked at config-save time — Admin gets blocked from saving a loop ("This creates a loop: A → B → A") before it ever runs. See issue #1's "config-time cycle detection" section for the exact mechanism.

**Recommended Fix:** Config-time cycle detection (from #1) is the primary prevention — stops bad config from being saved at all. Keep a hard hop-counter per session (e.g. max 20 hops) as a runtime safety net regardless — catches any loop that somehow gets created outside the normal config UI (manual DB edit, future config import, bug in the cycle-check itself). Both together, not either/or. **Easy, must-do.**

---

## 8. Two mappings for same event → only one ever runs, silently

**What it is:** If Admin creates two rules for the same event (e.g., two different "next skills" for when Skill A finishes), only the one created earliest in the database runs. The other is silently ignored.

**What happens:** Admin thinks both next skills will run. Only one does. If Admin ever deletes and recreates a mapping, the new one becomes the loser without any notification.

**Real example:** Two departments both submitted requests to be notified when a client approval comes in. Only the first request submitted gets the notification. The second department waits forever, wondering why they were never contacted. Deleting and resubmitting their request makes it even lower priority.

**Solved by issue #11's fix.** Root cause is the same — system can only fire one route at a time. Once #11 adds parallel branching, both mappings fire instead of one silently winning. No separate fix needed here. See #11 below.

---

## 9. Multiple database events fire but only one triggers next step

**What it is:** When a skill saves multiple types of records (e.g., a persona AND an ambition), each save can fire a separate event. But only the event that was created first (by Admin) triggers the next skill. Other events are ignored.

**What happens:** If Admin created the "ambition route" before the "persona route," next skill always triggers from ambition event — even if the persona event should be the trigger in this case. Other routes never fire.

**Real example:** A factory produces two products simultaneously. Two shipping teams are waiting — one for Product A, one for Product B. System only calls Product A's team (because their contract was signed first). Product B sits on the floor.

**Solved by issue #11's fix.** Same root cause as #8 — only one route can fire. Once parallel branching exists, the ambition event AND the persona event each independently trigger their own mapped skill — no single "first" event needs to win anymore. No separate fix needed here. See #11 below.

---

## 10. Admin cannot see or control which routing rule wins

**What it is:** When two rules compete for the same event, "winner" is determined by which row was created first in database. Admin has no field to set priority, no visual indicator of who wins.

**What happens:** Admin deletes and recreates a rule thinking it will take priority. It actually loses because it now has a newer (higher) database ID. Behavior is unpredictable and invisible.

**Real example:** Two managers both filed expense approval forms for the same budget. The accounting system processes them in order of form number. Neither manager can see who goes first. If a manager resubmits their form, they move to the back of the queue.

**Reduced but not solved by issue #11's fix.** Once parallel branching exists, "winning" mostly stops mattering — both rules can fire. But Admin may still deliberately want only ONE rule to fire in some cases (explicit single-path routing), so a `priority` field stays useful as an opt-in override, not as the default conflict-resolution mechanism. **Recommended Fix:** Add a `priority` field on mappings (optional, used only when Admin explicitly wants exclusivity), show resolved order in Admin UI. **Easy.**

---

## 11. No parallel branching — only one next skill ever starts ← ROOT FIX FOR #8, #9

**What it is:** System can only trigger ONE next skill after a skill completes. Even if Admin sets up multiple "next step" rules for the same event, only the first runs.

**What happens:** Workflows that need multiple teams to start simultaneously are impossible. Only one branch fires. All others are permanently ignored.

**Real example:** After a product launch, you need Marketing, Support, and Legal to all receive a notification and start their processes. System sends it only to Marketing. Support and Legal never get the signal. Their workflows never begin.

**Recommended Fix:** System runs on pg-boss (a job queue), not in-process direct execution — confirmed in `apps/worker/src/queue.ts` (`boss.work(...)` per job type). So "parallel branching" doesn't mean two skills literally execute at the same instant. It means: when Skill A finishes and multiple next-skill mappings match, **enqueue a job for every matched mapping**, not just the first one. pg-boss then processes each job — possibly truly in parallel if the worker has multiple concurrent slots, or one after another if it doesn't — but every branch eventually runs. The actual bug today is that unmatched branches never even get a job created; they don't run *slowly*, they don't run *at all*. **Medium.**

**This single fix also resolves:**
| # | Issue | Why solved |
|---|-------|-----------|
| #8 | Two mappings same event → one silently ignored | Both now fire instead of competing for "first" |
| #9 | Multiple DB events → only first route used | Each event independently triggers its own mapped skill |

**This fix reduces but doesn't eliminate:**
| # | Issue | Remaining gap |
|---|-------|---------------|
| #10 | No routing priority visibility | Priority still needed when Admin *wants* exclusivity, not just as a side-effect of creation order |

**⚠ Needs founder discussion before building — dependency-between-branches risk:**

Naive fan-out ("enqueue every matched branch immediately") assumes all matched next-skills are independent. Not always true. If Skill A's event maps to both Skill B and Skill C, and Skill C actually needs Skill B's output (via the previous-skill-output selector from issue #1's fix), firing both at the same time breaks C — it can run before B finishes, reading empty or incomplete context. Race condition by design, not by accident.

**Recommended approach (needs sign-off before implementation):**
1. When the event fires, find all matched next-skill mappings (B, C, D...).
2. For each matched skill, check its previous-skill-output source list (already exists from issue #1's fix).
3. If a matched skill (e.g. C) lists another matched sibling (B) as its source → real dependency between two branches of the same fan-out. Don't enqueue C immediately.
4. Skills with no cross-dependency among the matched batch → truly independent, enqueue all of them right away (e.g. Marketing/Support/Legal notification case — safe).
5. For the dependent case: C only gets enqueued after B's job actually completes and saves its output — effectively "sequential-after-B," not "sibling-of-B."

No new config field needed — the previous-skill-output selector (issue #1) already carries the dependency signal. The routing engine just needs to check it at fan-out time and gate accordingly, instead of blindly firing every match.

---

## 12. Database records never saved when direct skill-to-skill routing exists ← CRITICAL

**What it is:** When Admin sets up "Skill A → Skill B" directly, system transitions immediately to Skill B. But the step that saves Skill A's output to the database (creating personas, ambitions, OKRs) is SKIPPED. It only runs when there is NO direct routing.

**What happens:** Skill B looks up personas/ambitions in the database — finds nothing, because they were never written. Skill B's output is based on an empty database. All downstream data is wrong or empty.

**Real example:** A chef writes a shopping list (Skill A's output). The grocery buyer (Skill B) is supposed to buy what's on the list. But the list was never physically written down — it was in the chef's head. The grocery buyer goes to the store with no list and has to guess.

**Confirmed against current code (`conversation.ts`):** Real, currently happening. When `firedEvents` (skill.completed, structured_extract.create, conversation_message.create) matches a mapping, system transitions to the next skill immediately — the table mapper (`applyOperationsExtract`/`applyGenericExtractMappings`, which writes personas/ambitions/etc. to their real tables) is in the `else` branch only. It does not run later either — that turn's entity data is permanently never written to entity tables if direct routing fires.

**⚠ Needs founder discussion before fixing — design intent unclear:**
This skip might be intentional, not a bug. If Skill B only ever reads context via the previous-skill-output mechanism (conversation/StructuredExtract — see issue #1's fix), it doesn't need personas/ambitions in their entity tables to function. Saving raw JSON to StructuredExtract already happens unconditionally; only the *entity table* writes are skipped.

**The real risk:** other parts of the system that read directly from entity tables — Live Entity Summary (Q12), User Board (Q42), RAID list, Refine phase completion check (Q39) — would never see this data if it's only ever skipped during direct routing and never written. If Admin chains 5 skills together with direct routing the whole way, none of those 5 skills' entities ever land in Goal/Epic/Story/Persona tables, even though the conversation looks successful.

**Two possible fixes — needs a decision, not a default:**
1. **Always write to entity tables**, regardless of routing path — matches the original "Recommended Fix" below, removes the skip entirely.
2. **Keep the skip, but make it explicit and reversible** — Admin can mark a mapping as "skip entity write" only when they specifically don't need it (e.g. an internal scratch-pad chain), defaulting to "always write" otherwise. Safer default, opt-out instead of opt-in.

**Recommended Fix (if going with option 1):** Always persist the table-mapper save step before transitioning, regardless of whether direct skill-to-skill routing exists. **Easy, must-do (Critical) — but confirm intent with founder before implementing, since this reverts what looks like a deliberate design choice in the current flow.**

---

## 13. JSON output uses wrong key names → nothing gets saved

**What it is:** System only recognizes specific key names in the LLM's JSON output. If LLM uses different names (e.g., `"people"` instead of `"personas"`, or `"goals"` instead of `"ambitions"`), the mapper reads the output and does nothing.

**What happens:** All the data the LLM carefully extracted disappears. No records created. No events fired. Flow appears to complete successfully but database is unchanged.

**Real example:** You receive a completed form, but the person used "Full Legal Name" instead of "Name" and "Email Address" instead of "Email." Your system only reads exact labels "Name" and "Email" — so all data is thrown away. A blank record is all that's left.

**Recommended Fix:** Validate against schema; on mismatch, retry with the LLM telling it the exact expected key names; fuzzy key matching as last-resort fallback. **Medium.**

---

## 14. Parent record fails → child records silently skipped

**What it is:** When records have parent-child relationships (e.g., Pain Point must link to a Persona), if the Persona fails to save, the Pain Points that depend on it are silently skipped — not queued for retry, not flagged.

**What happens:** Persona missing. All its pain points, user needs, and stories are also missing. Next skill reads an empty database. No error surfaced anywhere.

**Real example:** A customer file fails to save (network error). All the orders, invoices, and contact notes for that customer are supposed to link to their file. Since the file doesn't exist, they're all discarded. The customer essentially doesn't exist in the system, but nobody is told.

**Recommended Fix:** Wrap parent+children save in a transaction (same fix as #15) — if parent fails, nothing for that batch is written, and the failure is surfaced. **Medium.**

---

## 15. No transaction → half-written data on failure

**What it is:** When saving multiple records, each one is saved individually. If record 5 fails, records 1–4 already saved remain in the database. There is no "undo everything if one fails" protection.

**What happens:** Database ends up in a mixed state — some records from this session saved, some missing. Next time the flow runs, it may create duplicates or conflicting data.

**Real example:** You're transferring files from one folder to another, one by one. After 4 succeed, the 5th fails mid-copy. Now you have files in BOTH folders but the set is incomplete in both. Nobody flagged it. The archive is corrupt.

**Recommended Fix:** Wrap multi-record saves in a DB transaction, all-or-nothing. **Easy — Prisma supports this natively.**

---

## 16. Update records with no ownership check ← CRITICAL

**What it is:** When LLM outputs "update record X," system updates whatever record has that ID — without checking whether it belongs to the current project. If LLM hallucinates or uses a wrong ID, it can update another project's data.

**What happens:** Another user's persona, ambition, or OKR gets silently overwritten with wrong data from a different project. Victim project's data is corrupted with no log of what happened.

**Real example:** A contractor is told to repaint room #204. They go to the building, find room #204 — which is in a different tenant's office. They repaint that room without checking whose office it is. The wrong tenant's office gets repainted. Neither the contractor nor the system flagged the mistake.

**Recommended Fix:** Always filter update queries by `projectId`; reject if the target record doesn't belong to the current project. **Easy, must-do (Critical, security).**

---

## 17. Skill never finishes — no clear "when to stop" condition

**What it is:** Skills end by outputting a special "I'm done" signal. But if the skill prompt doesn't make it clear when that signal should appear, the LLM may keep the conversation going indefinitely.

**What happens:** Skill never fires completion events. Flow never moves to next step. Conversation is stuck in limbo forever. No timeout stops it.

**Real example:** You tell an interviewer "ask questions until you're satisfied." Without defining what "satisfied" means, the interviewer asks question after question — 30, 40, 50 questions — because they're never sure if they have enough. The candidate sits there and the next stage never begins.

**Recommended Fix:** Require every skill prompt to explicitly define its completion criteria at creation time; validate presence in Admin UI before activating a skill. **Easy.**

---

## 18. Auto-injected finish instruction conflicts with Admin's skill prompt

**What it is:** System automatically tells every skill "end your response with a done signal when finished." If Admin's skill prompt says something like "always wait for the user to say DONE before ending," both instructions are active simultaneously.

**What happens:** LLM behavior becomes unpredictable — sometimes ends early, sometimes never ends, depending on which instruction it weighs more heavily in a given response.

**Real example:** Employee handbook says "always get supervisor sign-off before closing a ticket." The automated system says "close the ticket when work is complete." The employee gets mixed instructions. Some days they wait for the supervisor, some days they close tickets immediately. Nobody knows what will happen next.

**Recommended Fix:** Define explicit precedence — auto-injected completion rule always wins over Admin's custom wording — and remove the ambiguity from the prompt template. **Easy.**

---

## 19. "Done" signal can be triggered by accident

**What it is:** System detects skill completion by checking if the output text contains the phrase `<skill_done/>` anywhere. If LLM writes that phrase as an example, in an explanation, or in sample output — skill is instantly marked done.

**What happens:** Skill ends prematurely. Whatever was generated at that point is treated as final output. Remaining work never happens. Flow advances to next skill too early.

**Real example:** A teacher is explaining to students how to write a sign-off letter. They say the word "APPROVED" as an example. The automated system reads "APPROVED" and immediately processes the unsigned letter as approved. The actual approval step is bypassed.

**Recommended Fix:** Require the done signal to be the sole content of its own line/final message, not a substring match anywhere in the output. **Easy, must-do.**

---

## 20. Token limit set too low → skill crashes, nothing saved

**What it is:** Admin can configure a maximum token (word count) limit per skill. If context (database data, previous outputs, conversation history) is too large for that limit, the AI API rejects the request entirely.

**What happens:** Skill fails. No output generated. No records saved. Flow stops. User sees an error or a silent dead-end.

**Real example:** You hire a consultant and give them a 10,000-page briefing, but their contract only allows 1 hour of reading time. They reject the engagement entirely — the project can't start. If you'd given them a summary, they could have started immediately.

**Recommended Fix:** Pre-check assembled context size against the model's limit before sending; if over, auto-trim lowest-priority sections (oldest history first) instead of failing outright. **Medium.**

---

## 21. No size limit on database context → token costs explode

**What it is:** When Admin configures which database tables to inject into the LLM, ALL records from that table are fetched and sent. No maximum. A table with 500 personas sends all 500.

**What happens:** Token cost per request multiplies with data size. Context window can be exceeded. Large projects become unusable. Each AI call becomes extremely expensive.

**Real example:** Every time a sales rep makes a phone call, they are handed the entire company's customer database — all 50,000 records — to reference. They can't even carry it. Most is irrelevant. The phone company bills by the minute, so each call costs 100x more than it should.

**Recommended Fix:** Cap records injected per table (e.g. most recent 50), summarize if the table exceeds the cap. **Easy.**

---

## 22. Knowledge base only works for two hardcoded skills

**What it is:** The system has a fixed list of only two skills allowed to receive knowledge base content. Any new skill Admin creates will never receive knowledge base content, regardless of how it's configured in the Admin panel.

**What happens:** Admin creates a new skill, links it to a knowledge base, but the skill never receives that knowledge. LLM answers from general training only, ignoring the expert guidance Admin prepared.

**Real example:** Company has a training library. The HR policy says only employees named "Alice" and "Bob" can access it. New employee "Carol" joins and is supposed to use the library — but the policy was never updated. Carol has no access. Nobody notices.

**Recommended Fix:** Remove the hardcoded allowlist; use the existing `kbEligible` flag on every skill uniformly. **Easy — code already half-supports this.**

---

## 23. Knowledge base error crashes entire skill — no fallback

**What it is:** If the database query for knowledge bases fails (network hiccup, DB overload), the system throws an error and the entire skill invocation fails. Knowledge base is optional information — it's not required for the skill to work — but failure treats it as required.

**What happens:** Users get an error for a knowledge base database issue. Skill never runs. The actual work — answering a question, generating output — never happens.

**Real example:** A consultant is about to give advice. They try to get the reference manual from the bookshelf. The shelf breaks. Instead of giving advice from memory, the consultant says "I can't work today, the bookshelf is broken." Client gets no service.

**Recommended Fix:** Wrap KB injection in try/catch and continue without KB content on failure (current code already does this in `injectKnowledgeBases` — confirm it's applied everywhere KB injection is called). **Easy — verify, may already be fixed.**

---

## 24. Wrong knowledge base injected due to loose topic matching

**What it is:** Knowledge base is injected when user's message contains the topic word anywhere — even if unrelated. Example: KB about "project management" injects when user says "I need to manage my expectations about this project."

**What happens:** LLM receives irrelevant expert guidance. Responses are confidently wrong — mixing real expertise with mismatched context.

**Real example:** A librarian injects the "Cooking Basics" reference book whenever a customer mentions the word "recipe." A customer asks "Do you have a recipe for success in business?" and gets handed a cookbook. The customer reads it and gets irrelevant advice delivered with full confidence.

**Recommended Fix:** Current code already uses pgvector cosine similarity with thresholds, not substring matching — this issue may be stale; confirm against latest `context.ts`. **Verify only.**

---

## 25. Skill prompt and knowledge base content contradict each other

**What it is:** Knowledge base content and Admin's skill prompt have the same authority level. LLM cannot tell which to prioritize. If they say different things, LLM picks inconsistently.

**What happens:** Same question, different session, different answers. Users notice inconsistency. Support team can't reproduce issues. Trust in system degrades.

**Real example:** Employee handbook says "always offer a refund on defective products." The training manual says "never issue refunds without manager approval." Customer service rep follows whichever document they happened to read last. Some customers get instant refunds, others are escalated. Nobody can predict which.

**Recommended Fix:** Add explicit precedence instruction to every system prompt: "Skill instructions override Knowledge Base content if they conflict." **Easy.**

---

## 26. Greedy regex captures wrong or merged JSON blocks

**What it is:** System looks for JSON in LLM output by scanning for `{` to `}`. If LLM outputs two separate JSON blocks (e.g., debug info and actual data), the scanner grabs everything from the first `{` to the last `}` — merging both blocks into one broken JSON.

**What happens:** JSON parse fails on the merged garbage. No data saved. No next skill triggered. Flow stops.

**Real example:** You receive a letter with two separate tables of data. Your scanner is set to capture "from first column header to last table footer." It merges both tables into one giant confused layout. The merged data makes no sense. Your accounting system rejects it. Nothing gets processed.

**Recommended Fix:** Require LLM output to wrap structured JSON in a single fenced code block; parse only the first fenced block, not first-`{`-to-last-`}`. **Easy.**

---

## 27. Token budget check has race condition → limit exceeded by concurrent users

**What it is:** When a free-tier user hits their token limit, system checks usage BEFORE running the skill. But if two requests arrive at exactly the same time, both checks happen simultaneously — both see usage just under the limit — and both proceed. User ends up 2x over limit.

**What happens:** Free users can bust their budget unpredictably. If 10 tabs open simultaneously, 10x budget consumed in seconds. System has no atomic lock.

**Real example:** A concert has 1 seat left. Two people call the box office at the same moment. Both agents check inventory simultaneously — both see "1 seat available" — both confirm the sale. Two people show up with valid tickets to the same seat.

**Recommended Fix:** Replace check-then-act with an atomic DB increment (row lock or `UPDATE ... WHERE usage < limit RETURNING`) instead of separate read+write. **Medium, must-do (Critical).**

---

## 28. Failures are invisible to Admin

**What it is:** When things go wrong (wrong entity name, failed ref, broken mapper, JSON parse error), errors are written to server logs and internal job stream — but there is no Admin dashboard, no email alert, no panel that says "Step 3 failed and here's why."

**What happens:** Admin sees the flow stopped but has no idea where or why. They need to manually search server logs. Most Admins don't have server access. Issues remain unfixed because they're undetectable.

**Real example:** A factory has 20 machines. Any can fail silently. The only signal is that finished products stop coming out the end. The floor manager doesn't know if it's Machine 3, 11, or 17. There's no dashboard, no alarm, no warning light. They have to walk the entire floor to find the problem.

**Recommended Fix:** Build a simple Admin error feed reading from the existing `JobStreamEvent`/audit table, surfaced as a dashboard list, not raw server logs. **Medium.**

---

## 29. Source map with multiple skills + `@previous` drops all other skills ← NEW

**What it is:** Admin can configure a skill to read output from multiple previous skills — say, Skill A and "the previous skill." But if a "previous skill" ID is provided, the system reads ONLY that previous skill's output and completely ignores Skill A.

**What happens:** Skill receives only one source of context instead of all configured ones. Any data from Skill A is silently excluded. LLM has incomplete information.

**Real example:** A reporter is told to write a story using two sources: their notes from last week AND today's interview. When today's interview arrives, the editor says "you have today's interview, use that." The reporter writes using only today's interview. Last week's notes — which had key background facts — are never referenced.

**Recommended Fix:** Merge `@previous` resolution with the rest of the configured skill list instead of replacing it. **Easy.**

---

## 30. Latest structured extract fetched regardless of which skill created it ← NEW

**What it is:** When reading a previous skill's structured JSON output, system grabs the most recently saved JSON from that conversation — without checking which skill actually created it.

**What happens:** In multi-skill conversations, Skill C may receive Skill B's JSON when it actually needs Skill A's JSON — simply because Skill B ran more recently.

**Real example:** A manager asks their assistant to pull the latest report from the filing cabinet. The assistant pulls the most recent document — which is an unrelated HR memo filed 10 minutes ago. The financial report the manager needed was filed yesterday. The assistant just grabbed whatever was on top.

**Recommended Fix:** Filter the extract query by `skillId`, not just recency. **Easy.**

---

## 31. Next skill triggered by database event receives empty message ← NEW

**What it is:** When a database event (like "persona saved") triggers the next skill, that skill is started with a completely empty message — no text, no content, nothing.

**What happens:** If the next skill's prompt says "based on what the user asked, do X," it has no user message to work with. LLM has no starting point. May produce generic, blank, or confused output.

**Real example:** After saving a customer's file, the system automatically routes it to the analyst. But the handoff note is blank — just an empty envelope. The analyst opens it, finds nothing inside, and has to guess what analysis is needed.

**Recommended Fix:** Construct a synthetic message summarizing the triggering event/entity (e.g. "Persona 'X' was just created") instead of passing an empty string. This is also the correct fix for issue #1's DB-event-triggered case — when the chain is started by a database write, not a finished skill with text output, there's no "previous skill output" to fetch at all. Build context from the event/entity data directly, never attempt a previous-skill-output lookup for this path. **Easy.**

---

## 32. PDF generation without done signal → flow permanently stuck ← NEW

**What it is:** Skills can generate a PDF and also signal they're complete — but these are two separate signals. If LLM only outputs the PDF signal without the "I'm done" signal, PDF is generated but skill is never marked complete.

**What happens:** PDF appears successfully. User downloads it. But the flow never advances. Next skill never starts. Session is permanently stuck — looks fine on the surface.

**Real example:** An employee finishes their report and prints it. They give the printout to the client. But they forgot to click "Mark Complete" in the task system. The manager sees the task as open, the next team never receives the handoff notification, and the project stalls — even though the actual work is done and the client has it.

**Recommended Fix:** Treat the PDF-generation completion signal as an implicit done signal too — don't require both separately. **Easy.**

---

## 33. Configuring wrong table in source map could expose other users' data ← NEW

**What it is:** Admin can configure which database table to pull into a skill's context. System assumes all tables have a "project" filter. Some tables (like User profiles) don't belong to projects — they belong to the whole platform.

**What happens:** If Admin accidentally configures a system table, all records in that table could be returned — across all projects, all users. Sensitive user data gets injected into an LLM context.

**Real example:** A bank teller is supposed to pull "this customer's account records." They accidentally request "all employee records" instead. Because the employee system has no branch filter, they receive the HR records of every employee in the company. This data gets read into a customer-facing context.

**Recommended Fix:** Allowlist only project-scoped tables in the source-map config UI; block any table without a `projectId` column from being selectable at all. **Easy, must-do (Critical, security).**

---

## 34. Generic mapper always fires same event, blocking precise routing ← NEW

**What it is:** When the generic mapper saves records (personas, ambitions, etc.), it always reports back one fixed event: "structured extract created" — regardless of what was actually saved. Admin cannot route differently based on whether a persona was created vs. an ambition was created.

**What happens:** All generic mapping outcomes look identical to the routing system. If Admin wanted "if persona created → go to Skill X, if ambition created → go to Skill Y," it's impossible with the generic mapper. Both always trigger the same path.

**Real example:** A warehouse receives deliveries. Regardless of what arrived — chairs, computers, or medical supplies — the system always logs "Delivery received." The team waiting for medical supplies has no way to know if their shipment arrived specifically. Everyone sees the same generic notification. Precision routing is impossible.

**Recommended Fix:** Emit specific event names per entity type actually saved (`persona.created`, `ambition.created`), not one generic `structured_extract.created` for everything. **Medium.**

---

---

## Open Architecture Questions

### Q1. Context Assembler — Project Entity Context

Is the Context Assembler based on the Project Entity Context?
For `personas.all`, should it include linked Personas + Pain Points + User Needs, or should these be separate context keys?

**Recommended Answer:** Yes, semantic keys map to grouped entity context. `personas.all` returns Persona + nested Pain Points + User Needs as one combined object — not split into separate keys. Fewer config items, matches "load what's needed" intent.
**Feasibility:** Easy — extend `context.ts` with a query-handler registry keyed by semantic string, replacing raw table names in `inputSourceMap`.

---

### Q2. Project Context — Layers Explained

Please explain each layer of Project Context and how automation will work, with an example.

**Layer 1 (auto-capture):**
- What format do rules take — keywords, regex, something else?
- Who creates rules — Admin Dashboard or config file seeded before go-live?
- Does it fire on every entity save or on a schedule?

**Layer 2 (Evolve proposal):**
- Does Evolve skill output a special tagged block to signal a context proposal, or does backend run a secondary LLM check on every message?
- If user dismisses a proposal — discarded permanently or surfaced again later?

**Layer 3 (periodic drift detection):**
- How is frequency configured — Admin Dashboard, per-project setting, or global config?
- Where do proposals appear — next Evolve session, notifications panel, or email?
- How long do unconfirmed proposals stay alive before expiring?

**Recommended Answer:**
- **Layer 1:** rule table (`pattern`, `targetField`), Admin Dashboard editable, evaluated on every entity create/update via a Prisma hook — instant, not cron.
- **Layer 2:** Evolve skill outputs a structured `<context_proposal>` block, Response Parser extracts it, one-click confirm endpoint. Dismissed proposals are soft-deleted, not resurfaced.
- **Layer 3:** pg-boss recurring job, default every 24h (project-level override allowed). Proposals appear as a system message in next Evolve session plus a notification badge. Expire after 14 days unconfirmed.
**Feasibility:** Medium — needs a `ProjectContextProposal` table and a recurring pg-boss job.

---

### Q3. Team Member Flow in Discovery and Refine

In the Discovery and Refine phases, should we involve team members?
What happens if the invited team member has not accepted the invitation yet?

**Recommended Answer:** No team member involvement in Discover/Refine — founder-only by design. If a team member is invited before accepting, no membership row exists yet, so they simply aren't a factor; founder proceeds through DRI alone regardless of invite state.
**Feasibility:** Easy — gate Discover/Refine routes to `role === 'founder'`.

---

### Q4. audit.recent — Data Structure

What exact data should we pass in `audit.recent`?
Do we need to pass timestamp/time-based audit data? If yes, what fields are required?

**Recommended Answer:** `{ id, eventType, entityType, entityId, summary, source, createdAt }`, last 20 entries. Summary is a short human-readable line, not the full before/after diff — that stays in the audit table, pulled on demand only.
**Feasibility:** Easy.

---

### Q5. KB Injection — Embedding Approach

How do we detect the correct KB topic and inject it?
Currently we are using embeddings. Is that the expected approach, or do we need another method?

**Recommended Answer:** Confirm: keep the current Cloudflare BGE-M3 + pgvector cosine approach. It matches the PRD's "right expertise surfaces based on topic" intent — that's semantic matching, not keyword matching. Tune per-KB thresholds only if founder reports false positives in testing.
**Feasibility:** No rebuild needed — just sign-off.

---

### Q6. Prompt Assembly — KB Content Placement

KB content should go into the system context, not as a user message.
User messages should always remain part of the conversation context only. Please confirm this structure.

**Recommended Answer:** Confirm: KB markdown belongs in the system prompt section (application trust tier), not the user message. It's injected expertise, not conversation content.
**Feasibility:** Verify current code path lands KB sections in the `system` param, not `messages`.

---

### Q7. Response Router vs Event Router — Difference

Why do we need a Response Router if we already have an Event Router?
Please explain the difference between both.

**Recommended Answer:** Event Router is inbound: app event → which Skill runs. Response Router is outbound: Skill's response → where results land (entity write, UI, document, audit). Same pipeline, opposite ends. Keep both — they're not redundant.

---

### Q8. Audit Logger — Health Score Delta

What does Health Score Delta mean?
How is it calculated and stored?

**Recommended Answer:** V1 doesn't recalculate Health Score in Venture (PRD section 12), so Delta is not applicable yet. Make the field nullable now; populate it only when a future version adds live recalculation.
**Feasibility:** Easy — leave field optional.

---

### Q9. Discovery Phase Session Storage

Where do we store the Discovery phase session?
There is no clear entity/table for session storage visible in the current schema.

**Recommended Answer:** Reuse the existing `Conversation`/`ConversationMessage` tables, scoped by a new `phase` column (`discover`/`refine`/`evolve`). No separate session table needed — same shape, different scope.
**Feasibility:** Easy — one column addition.

---

### Q10. Phase Completion Rules

Where do we define phase completion questions or completion rules?
How will the system know that a phase is completed?

**Recommended Answer:** Deterministic, not LLM-judged. Discover complete = all 3 core questions have ≥1 extracted entity. Refine complete = ≥1 connected Goal→Epic→Story thread (ties to Q39). Evaluated on demand when founder clicks "Continue," not on every keystroke.
**Feasibility:** Easy-medium.

---

### Q11. Skill-to-Phase Validation

Can we validate whether a skill belongs to Discovery, Refine, or another phase?
Since skills are dynamic and admin-created, how do we know what type of skill it is?

**Recommended Answer:** Add a `phase` field to the Skill record (`discover`/`refine`/`evolve`/`build`/`global`). Event Router and Context Assembler check it before invoking — reject mismatches. Overlaps with Q36's `touchpoints` — recommend `touchpoints` as the broader routing/display field, `phase` as a narrower validation subset.
**Feasibility:** Medium — schema change + validation middleware.

---

### Q12. Live Entity Summary — Refine Phase

Please explain what Live Entity Summary means in the Refine phase.
What data should it show and how should it update?

**Recommended Answer:** Deterministic server function, recalculated on every entity save — not an LLM call. Returns entity counts, completeness %, and broken-link list. Frontend polls or receives a push after each save.
**Feasibility:** Easy — this is the "Refine Summary Assembler" already named in PRD section 17.

---

### Q13. Health Score — Full Concept

Please explain the full Health Score concept with an example.
What factors affect it and how does it change over time?

**Recommended Answer:** Documentation task, not a build decision — see PRD section 12's 7-component weighted table. No open question remains once founder confirms the weightings are correct as written.

---

### Q14. Venture — What It Is

In the document, Venture is mentioned as a workspace for Build Phase management, Build Pack generation, Build Sync tracking, backlog view, RAID, and Evolve active.
- Is Venture the main project workspace where the founder's startup/product idea is managed?
- How is Venture different from Project, Workspace, or Build Phase?
- What exact entities/data are stored under Venture?
- When an invited team member accepts the invitation, do they land inside this Venture workspace directly?

**Recommended Answer:** Venture is a workspace *state* on Project (`phase = 'venture'`), not a separate entity or table. Contains: active Build Phases, Backlog (Stories), RAID, Evolve session list. Invited team member lands directly on Venture's default tab.
**Feasibility:** Easy — phase enum value, no new entity required.

---

### Q15. Evolve — Approve/Reject Flow

When screening fires and impact list is presented to founder:
- Does the impact list come back inside the conversation stream, or as a separate structured API response?
- Are impact items stored in DB (founder can leave and return) or held in memory for current session only?
- Does frontend send all decisions in one API call, or one call per item?
- Pre-change state "archived" — what data exactly? Entity before-state JSON, or full project snapshot?
- If founder closes browser mid-review — are pending items recoverable from Draft, or lost?

**Recommended Answer:** Impact list returns as a separate structured API response, not inline in the chat stream — cleaner for rendering a checklist UI. Stored in DB (`ImpactItem`, status `pending`) so founder can leave and return. Frontend batches all decisions into one "Apply" call rather than one call per item. Pre-change state archived = entity before-state JSON only, not a full project snapshot.
**Feasibility:** Medium — `ImpactItem` and `EvolveSession` tables already exist in contracts; need DB tables + atomic apply transaction.

---

### Q16. Evolve — Screening Rules Format

Document says screening rules are "provided as configuration by the founder."
- What does one screening rule look like — what fields does it have?
- Are rules stored in a DB table (Admin Dashboard editable) or a config file?
- If no rules exist — does every Goal-related conversation trigger screening, or nothing?

**Recommended Answer:** DB table `ScreeningRule { id, entityType, changeType, severityDefault, conditionExpr }` — simple JSON condition, not a full DSL. Admin Dashboard CRUD. No rules configured = skip screening and log directly — safer default than silently blocking all Goal changes.
**Feasibility:** Medium.

---

### Q17. Evolve — Session Topic

Document says sessions are "grouped by topic and launched-from screen."
- Is topic set manually by user when starting a session?
- Or auto-generated from first message, or AI-detected at session end?

**Recommended Answer:** AI-generated short label at session save/end (cheap Haiku call summarizing the first few messages) — manual tagging adds friction founders won't bother with. Editable after the fact.
**Feasibility:** Easy.

---

### Q18. Evolve — Draft Save Contents

Document says Draft is "saved mid-conversation, resumable."
- Does Draft save only conversation messages, or also any pending ImpactItems?
- If screening was in progress when Draft was saved — is that state restored on resume, or does screening restart?
- After how long does an unresolved Draft expire?

**Recommended Answer:** Draft saves the full conversation plus any in-progress `ImpactItem` state (still `pending`, linked to the draft). Resuming restores both the chat and the pending-review screen exactly where it was left. Expires after 30 days inactive (configurable).
**Feasibility:** Medium.

---

### Q19. Evolve — Session Creation Rate Limit

Document says rate limit on session creation to prevent flooding.
- What is the limit — per hour, per day?
- Per user or per project?
- Configurable in Admin Dashboard or hardcoded?

**Recommended Answer:** 20 sessions/hour per user (per-user, not per-project — spam risk is per-actor even though the token pool is shared). Configurable via Admin config table. On hit: 429 with a "slow down" modal.
**Feasibility:** Easy.

---

### Q20. Evolve — Action Capability Confirmation

Document says "user confirms before any write action."
- When Evolve proposes a write (create Story, update entity) — does LLM output a structured proposal block the backend holds pending, or does the frontend handle confirmation before calling the API?
- What endpoint does frontend call to execute a confirmed action?
- Can user partially confirm — approve 2 of 3 proposed Stories?

**Recommended Answer:** LLM outputs a structured `<action_proposal>` block. Response Parser extracts it; backend holds it pending (not yet written). Frontend renders a confirm card, calls `/evolve/actions/:id/confirm` to execute. Each proposed action is independently confirmable — partial approval supported.
**Feasibility:** Medium-hard — new pending-actions table and confirm endpoint.

---

### Q21. Evolve — Team Member and Goal Changes

Document says "Founder only" for Goal changes via Evolve.
- If a team member's Evolve session leads toward a Goal change — does the backend block it, or does the skill prompt prevent it?
- If screening fires for a team member — should API reject the apply call with a permission error?

**Recommended Answer:** Defense in depth: block at the skill-prompt level (constraint baked into Evolve's system prompt for non-founder roles) AND enforce server-side at the apply endpoint regardless of what the LLM proposed — reject with 403 if a team member's session somehow reaches a Goal-change apply call. Never rely on prompt-only enforcement for permissions.
**Feasibility:** Easy, and non-negotiable from a security standpoint.

---

### Q22. Build Sync File — Format and Ingestion Rules

Document says format is "defined by founder and provided as configuration."
- What file format — CSV, JSON, Excel? Who decides?
- What minimum fields must the file contain (Story ID, title, status, Build Phase identifier)?
- On upload: replace all statuses (full override) or merge only changed rows?
- If a Story in the file was deleted from Remorra — skip silently or reject the upload?

**Recommended Answer:** CSV — simplest, founder-editable in any spreadsheet tool. Required columns: `story_id, title, status, build_phase_id`. On upload: merge only changed rows matched by `story_id` — full override is too destructive if a row was missed. Story not found in Remorra → skip + report in summary, don't fail the whole upload.
**Feasibility:** Easy.

---

### Q23. Build Pack — PRD Artefact Timing

Document says PRD is "generated via Evolve (Document Generator Skill)."
- Is PRD auto-generated when founder marks Build Phase ready, or must founder generate it via Evolve first?
- If pre-generated required: should Build Pack trigger fail if no PRD exists yet?
- Are 6 artefacts one ZIP download or separate links?

**Recommended Answer:** Auto-generate the PRD as part of the Build Pack trigger (call Document Generator Skill synchronously inside the same job) rather than requiring pre-generation — one button for the founder. Package all 6 artefacts as a single ZIP download.
**Feasibility:** Medium — orchestrate the skill call inside the existing `handleDocument` pipeline.

---

### Q24. Build Pack — Brand Kit and User Flow Uploads

Document says Brand Kit and User Flow "require file attachment endpoints stored per Build Phase."
- What formats accepted for Brand Kit? For User Flow?
- Maximum file size?
- Are these stored permanently in Supabase Storage (unlike Discover uploads which are discarded)?

**Recommended Answer:** Brand Kit: zip, pdf, png, jpg. User Flow: pdf, png, jpg, or a Figma share link as an alternative. Max 20MB. Stored permanently in Supabase Storage per Build Phase — unlike Discover uploads, these are referenced documents, not just a context source to discard.
**Feasibility:** Easy — reuse the existing `storageObject` flow.

---

### Q25. Build Sync Ingestion — Error Handling

When founder uploads updated Build Sync File:
- Build Phase identifier not found — fail entire upload or return specific error?
- Story ID not found in Remorra — skip row silently, warn, or reject file?
- Should API return a summary of changes after ingestion (X updated, Y skipped)?

**Recommended Answer:** Build Phase identifier not found → fail the entire upload immediately. Story ID not found → skip + warn, included in a summary response (`{ updated, skipped, skippedRows }`).
**Feasibility:** Easy.

---

### Q26. Health Score — Storage and Recalculation

Document says Health Score fires once at Initiate with 7 components.
- Where is it stored — dedicated `HealthScore` table or JSON on Project record?
- If founder returns to Refine then re-enters Initiate — does it recalculate or show original score?
- Should Health Score be readable from Venture after Initiate?
- What is the exact JSON output schema the skill must produce? (Founder provides per Section 3.)

**Recommended Answer:** Dedicated `HealthScore` table (`projectId, overallScore, subScores JSON, rationale, actions JSON, calculatedAt`) rather than a JSON blob on Project. Returning to Refine and re-entering Initiate re-triggers calculation and overwrites. Readable from Venture — founder's score should persist and stay visible.
**Feasibility:** Easy-medium.

---

### Q27. Concurrency — Evolve Session Conflict

Document says "conflict detection on simultaneous Evolve sessions."
- What counts as a conflict — two users with Evolve open at same time, or both modifying same entity?
- Is second user blocked immediately on session open, or only when applying changes?
- How is it detected — project-level lock on session start, or existing version field at apply time?

**Recommended Answer:** Conflict = both sessions modifying the *same entity*, not just both being open simultaneously. Detection reuses the existing optimistic-lock version field at apply time; mismatch surfaces a conflict UI for human resolution. No new locking mechanism needed.
**Feasibility:** Easy — wire the existing version-check pattern into Evolve's apply step specifically.

---

### Q28. Stripe — Expired Subscription Behaviour

Document says "graceful handling of expired/cancelled subscriptions (behaviour configurable)."
- On expiry — immediate lockout of Venture/Evolve, or grace period?
- If grace period — how many days? Configurable?
- After lockout — can founder still log in and view data read-only?

**Recommended Answer:** 7-day grace period (configurable). During grace: Venture/Evolve become read-only, not fully locked. After grace expires: full lockout except the billing page. Read access to their own data is never fully removed.
**Feasibility:** Easy — middleware check on subscription status plus a grace-window calculation.

---

### Q29. Stripe — Team Member Billing Timing

Document says "adding a team member adds £49/month, removing reduces."
- Is £49 charged on invite sent or invite accepted?
- Invite sent but never accepted — charged or not?
- Member removed mid-cycle — prorated refund or full month charged?

**Recommended Answer:** Charge on invite **accepted**, not sent — avoids billing for invites that bounce or are never accepted. Member removed mid-cycle: no proration, reduces from the next billing cycle only.
**Feasibility:** Easy — standard Stripe subscription-item add/remove on invite-accept and removal webhooks.

---

### Q30. Admin — Freeze Account Scope

Document says "Freeze Account disables all write access. Data stays intact."
- Frozen project — read access still allowed or full lockout?
- What do frozen users see when they try to log in?
- Who can unfreeze — any admin, or only the admin who froze it?

**Recommended Answer:** Frozen = full read-only for the project's users, not just write-blocked at the API. Login still works; UI shows an "Account frozen — contact support" banner with nothing else visible. Unfreeze is available to any admin, not restricted to the admin who froze it.
**Feasibility:** Easy — global middleware flag check.

---

### Q31. Configuration Delivery — How Does Founder Provide Config Items?

Document says founder provides (not developer): Health Score formula, screening rules, Build Sync format, Build Pack PDF templates, auto-capture rules.
- How does founder deliver each — Admin Dashboard UI, config file, or DB seed?
- Must all config items exist before go-live, or can system run with defaults?

**Recommended Answer:** Admin Dashboard UI for every founder-config item — no config files, since the founder isn't technical. System must run on sane hardcoded defaults for anything not yet configured — never block go-live waiting on founder input.
**Feasibility:** Medium-large — this is the single biggest scope item; needs dedicated Admin Dashboard screens per config type.

---

### Q32. Entity Model Migration — Goal → Epic → Story

PRD describes 3-level hierarchy: Goal → Epic → Story, replacing old Ambition → OKR → Persona → UserNeed → UserStory chain.
- Does new model replace old entities entirely, or do both exist in parallel?
- What happens to existing Ambition/OKR data — archived, converted, or deleted?
- Does Persona still exist as a separate entity, or absorbed into Goals/Epics?
- Is UserNeed deprecated, or renamed to Story?

**Recommended Answer:** Clean replace, not parallel. One-time migration script: Ambition→Goal, OKR dropped (merged into Goal detail), Persona unchanged (stays a reference entity), UserStory→Story (renamed, now a child of Epic). One-way migration; old tables dropped once confirmed.
**Feasibility:** Hard — the largest schema change in the whole PRD. Treat as its own dedicated build phase with careful data migration and testing.

---

### Q33. Notifications — Triggers and Delivery

PRD mentions notifications but doesn't detail delivery mechanism.
- What triggers a notification — phase completion, Health Score drop, Evolve outcome, team invite, Build Sync upload?
- In-app only, email only, or both?
- Who configures preferences — founder, Admin Dashboard, or both?

**Recommended Answer:** Triggers: phase completion, Health Score result ready, Evolve screening pending review, team invite sent/accepted, Build Sync upload processed. In-app only for V1 (notification bell + list) — defer email to V2. No granular per-notification preferences yet.
**Feasibility:** Easy (in-app) — simple `Notification` table plus a bell UI.

---

### Q34. Token Tracking — Free Tier Limits

PRD describes a free tier with token budget enforcement.
- What is the token limit — per day, per month, or per skill invocation?
- When limit is hit — block with error, queue until next period, or prompt to upgrade?
- Is token usage visible to founder in UI?
- Is limit per-user or per-project?

**Recommended Answer:** Per-project monthly cap (e.g. 500K tokens, configurable), not per-day. On hit: block with an upgrade modal (already stated in PRD section 15). Usage shown to founder via a simple progress bar.
**Feasibility:** Easy — reuse the existing `checkTokenBudget()`, just confirm the window is monthly.

---

### Q35. Audit Trail — Write Rules and Retention

Q4 only asked about `audit.recent` structure. Deeper rules unclear.
- Which actions write to audit trail — entity changes only, or also phase transitions, logins, document generation, Evolve sessions?
- Is audit trail append-only (no deletes ever)?
- How long are entries retained — 30 days, 1 year, indefinitely?
- Is audit trail exposed to founder in UI, or internal only?

**Recommended Answer:** Write on: entity changes, phase transitions, Evolve session completions, document generation. Not logins, not every chat message. Append-only, no deletes ever. Retain indefinitely for now. Founder sees a simplified "Activity" view; full detail stays internal.
**Feasibility:** Easy — extend existing audit logger call sites.

---

### Q36. Skill Registry — Touchpoints Field

PRD lists `touchpoints` as a Skill record field. Not in current schema.
- What does touchpoints define — which screens, which phases, or which user roles can trigger this skill?
- Is it used for routing, filtering, or UI display only?
- What format — array of strings, enum values, or something else?

**Recommended Answer:** `touchpoints`: array of phase/screen identifiers where the skill can be invoked (e.g. `["discover", "refine.problem", "evolve.venture"]`) — used both for routing validation (Q11) and for UI display.
**Feasibility:** Easy — add a string-array column.

---

### Q37. Skill Registry — Examples Field

PRD lists `examples` as a Skill record field. Not in current schema.
- Are examples few-shot input/output pairs stored per skill in DB?
- How are they injected into the prompt — appended to system prompt, or as separate user/assistant turns in messages array?
- Who provides examples — founder via Admin Dashboard, or hardcoded at skill creation?

**Recommended Answer:** Store as an array of `{input, output}` pairs in a JSON column, injected as alternating user/assistant turns prepended to the real conversation in the messages array — true few-shot, not stuffed into the system prompt. Founder provides examples via the Admin Dashboard skill editor.
**Feasibility:** Easy-medium — LLM Gateway needs to splice example turns before the real conversation.

---

### Q38. Response Parser — Constrained vs Generative Handling

PRD says parser validates JSON for constrained Skills, extracts from natural language for generative Skills.
- What field on the Skill record signals constrained vs generative?
- If constrained Skill returns invalid JSON — retry, fail with error, or fall back to raw text?
- For generative Skills — what extraction markers does the parser look for?

**Recommended Answer:** Add an `outputMode: 'constrained' | 'generative'` field to Skill, tied to the existing `output_schema` type. Invalid JSON on a constrained skill → one retry with the validation error fed back to the LLM, then fail with a clear error if the retry also fails. Never silently fall back to raw text.
**Feasibility:** Easy — formalizes logic the output schema already implies.

---

### Q39. Refine — Pass Criteria Enforcement

PRD: at least one connected Goal → Epic → Story thread required before Initiate.
- Is this check server-side deterministic (Linkage Integrity Checker) or an LLM call?
- When does it fire — on every entity save, or only when founder tries to advance to Initiate?
- What happens if check fails — block phase transition with message, or show warning and allow?

**Recommended Answer:** Deterministic server-side check (Linkage Integrity Checker), not an LLM call. Fires when founder clicks "Continue to Initiate," not on every save. On failure: block the transition with a specific message linking to the incomplete area.
**Feasibility:** Easy.

---

### Q40. Initiate — Conversion Carousel

PRD mentions "conversion carousel showing what's available in Venture."
- What data does it show — feature list, entity counts, sample screens?
- Is it static content (configured by founder) or dynamically assembled from project data?
- Does it display before or after the Health Score result?

**Recommended Answer:** Dynamically assembled from the project's own data (entity counts, what's been built) rather than static marketing copy. Displays after the Health Score result, so the score builds trust/insight before the carousel converts on that momentum.
**Feasibility:** Medium — needs a small data-assembly endpoint; the carousel UI itself is the founder's frontend responsibility.

---

### Q41. Entity Model — Persona to Story Linking

PRD: Personas linked to Stories via many-to-many, built during Refine.
- What is the join table structure — persona_id, story_id, created_by, created_at?
- Is linking done via Evolve conversation, direct UI drag/drop, or both?
- If a Story is deleted — are persona links cascade deleted or flagged as broken?

**Recommended Answer:** Join table `PersonaStory { personaId, storyId, createdAt }` — minimal, no extra metadata needed for V1. Linking happens during Refine via Evolve conversation and is also directly editable in Venture — both paths supported. If a Story is deleted, cascade-delete the link rows.
**Feasibility:** Easy.

---

### Q42. Entity Model — User Board Assembly

PRD: User Board displays Personas, their Pain Points, and linked Stories.
- Is User Board data assembled server-side (API endpoint) or client-side from separate fetches?
- Does it include all Stories linked to a Persona, or only Stories in the active Build Phase?
- Real-time updates when Story status changes, or requires page refresh?

**Recommended Answer:** Server-side endpoint, not client-side stitching of multiple fetches. Includes all Stories linked to a Persona regardless of Build Phase — User Board is a strategic view, not a delivery-tracking view. Refetch on screen mount is sufficient for V1; no websocket needed.
**Feasibility:** Easy.

---

### Q43. Server Functions — Linkage Integrity Checker

PRD: deterministic rules for orphan/broken link detection; AI call only for contradiction detection.
- When does it run — on every entity save, on phase transition, or on-demand only?
- What qualifies as a contradiction that triggers an AI call vs a deterministic rule?
- Where is the result surfaced — inline warning, separate panel, or audit log only?

**Recommended Answer:** Deterministic rules run on every entity save (no LLM) for orphan/broken-link detection — same check reused from Q39. AI call (contradiction detection) only runs on-demand or on phase transition, since semantic contradiction checks are too expensive to run on every keystroke. Deterministic issues surface inline immediately; AI-detected contradictions surface as Evolve suggestions.
**Feasibility:** Medium — two-tier check system.

---

### Q44. Server Functions — Build Sync File Generator (Export)

PRD: exports current Build Phase Stories as clean file with blank statuses.
- What file format is exported — CSV, JSON, Excel?
- Does "blank statuses" mean empty string, null, or a placeholder like "To Do"?
- Can founder pull export at any time, or only after Build Pack is generated?

**Recommended Answer:** CSV — symmetric with Q22's ingestion format. Blank statuses = empty string, not null or a placeholder. Founder can pull an export at any time from the Backlog screen, not gated behind Build Pack generation.
**Feasibility:** Easy.

---

### Q45. Admin Dashboard — Status Breakdown

PRD defines 3 states: Signed Up (pre-Discover), Inception (DRI started), Delivery (reached Venture).
- What event transitions a user from Signed Up → Inception — first Discover message, or Discover completion?
- What event transitions Inception → Delivery — Health Score fired, payment confirmed, or first Venture screen load?
- Are these stored as a field on the project/user record, or derived from audit trail at query time?

**Recommended Answer:** Signed Up → Inception on first Discover message sent. Inception → Delivery on payment confirmed, not on Health Score firing. Compute as a derived value at query time from existing timestamps rather than storing a separate status column.
**Feasibility:** Easy — query-time derivation, no new writes.

---

### Q46. Admin Dashboard — Cancellation Flow

PRD: cancellation requires mandatory reason, stored for admin visibility.
- What are the reason options — fixed list or free text?
- Where is reason stored — subscription record, separate cancellation table, or Stripe metadata?
- After cancellation — immediate access loss or access until end of billing period?
- Is there a "pause" option or only full cancel?

**Recommended Answer:** Fixed list plus "Other" free text. Stored in a dedicated `CancellationFeedback` table, not Stripe metadata. Access continues until end of billing period. No pause option for V1 — cancel/resubscribe is simpler and sufficient.
**Feasibility:** Easy.

---

### Q47. Team Member — Invitation Flow and Evolve Access

PRD says team member receives email invite, creates account, lands in Venture directly.
- Does team member see founder's Evolve conversation history, or does each user have separate session history?
- If team member's Evolve conversation leads toward a Goal change — silently blocked, error shown, or Goal option never surfaces at all?
- Invitation email — sent by system automatically, or does founder send manually?
- How long is the invite link valid before it expires?
- If invite expires and team member clicks link — can founder resend, or must re-invite?
- What if founder sends invite before reaching Venture (project still in Discover/Refine)? Team member lands where — blocked, waiting screen, or error?
- How does "skip DRI" work technically — invite token sets a role flag that bypasses phase gate checks, or team member gets a direct Venture URL regardless of project phase?
- "Lands in Venture" — which exact screen/route? Backlog, RAID, Build Phase overview, or a generic Venture dashboard?

**Recommended Answer:** Invite link valid 7 days. Expired link shows "This invite has expired — ask the founder to resend," with a resend button on the founder's team management screen. System sends the invitation email automatically (Resend/Postmark/SES). Each user gets a separate Evolve session history. If founder invites before reaching Venture: block the invite action entirely until `project.phase >= 'venture'`. "Skip DRI" is enforced as a role-based route guard (`project_membership.role === 'team_member'` always redirects DRI routes to Venture), not a URL-based bypass. Team member lands on the Backlog tab specifically.
**Feasibility:** Medium — invite-token table, email service integration, and role-based route guards.

---

---

## Summary

| # | Issue | Severity |
|---|-------|----------|
| 1 | `@previous` empty when first skill runs | High |
| 2 | Wrong previous skill output fetched across sessions | High |
| 3 | Previous skill ID not validated for ownership | Medium |
| 4 | Wrong columns selected → duplicate records | High |
| 5 | Wrong entity name → record silently skipped | High |
| 6 | Missing event mapping → fake success message | High |
| 7 | Circular routing → infinite loop | **Critical** |
| 8 | Multiple mappings same event → one silently ignored | High |
| 9 | Multiple DB events → only first route used | High |
| 10 | No routing priority visibility for Admin | Medium |
| 11 | No parallel branching support | High |
| 12 | DB records never saved with direct skill routing | **Critical** |
| 13 | Wrong JSON key names → nothing saved | High |
| 14 | Parent record fails → children silently skipped | High |
| 15 | No transaction → partial data on failure | High |
| 16 | Update has no project ownership check | **Critical** |
| 17 | Skill has no clear exit condition | High |
| 18 | Auto-injected instruction conflicts with Admin prompt | Medium |
| 19 | Done signal falsely triggered by example text | Medium |
| 20 | Token ceiling too low → skill crashes | High |
| 21 | No context size limit → cost explosion | High |
| 22 | KB allowlist hardcoded for only 2 skills | Medium |
| 23 | KB error crashes entire skill — no fallback | High |
| 24 | Wrong KB injected by loose topic match | Medium |
| 25 | Skill prompt and KB contradict each other | Medium |
| 26 | Greedy regex merges multiple JSON blocks | High |
| 27 | Token budget race condition | **Critical** |
| 28 | All failures invisible to Admin | High |
| 29 | `@previous` + other skills → other skills dropped *(NEW)* | High |
| 30 | Wrong structured extract fetched by recency *(NEW)* | High |
| 31 | DB-event-triggered skill gets empty message *(NEW)* | High |
| 32 | PDF without done signal → flow stuck forever *(NEW)* | High |
| 33 | Wrong table config exposes cross-user data *(NEW)* | **Critical** |
| 34 | Generic mapper always fires same event → no precise routing *(NEW)* | Medium |
