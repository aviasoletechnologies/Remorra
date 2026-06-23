# Flow Issues — Plain Language Reference

34 issues verified against codebase code. No code shown — plain English only.
New issues found in code marked **← NEW**.
Critical issues marked **← CRITICAL**.

---

## 1. `@previous` context empty when first skill runs

**What it is:** Admin sets up a skill to read the output of the "previous skill." But if this skill runs first (nothing ran before it), there is no previous output. System doesn't warn anyone — skill just starts with a blank slate.

**What happens:** Skill runs with no context. LLM guesses or gives generic answers. Output is wrong from the start, and every skill that follows inherits that bad start.

**Real example:** You tell a new employee "summarize the report from the person before you." They arrive first — there is no person before them. Instead of asking for clarification, they write a blank summary and submit it. Everyone downstream works from a blank summary.

---

## 2. Wrong previous skill output given to next skill

**What it is:** When fetching the "previous skill's output," system grabs the most recent output for that skill type across the entire project — not the one from the current session.

**What happens:** If the same skill ran yesterday and again today, the next skill reads yesterday's output instead of today's.

**Real example:** You run a "customer interview" session on Monday and another on Friday. The Friday analysis skill is supposed to use Friday's interview — but because Monday's was saved first, analysis uses Monday's data. Friday's interview is completely ignored. Admin has no idea.

---

## 3. Previous skill ID never checked for ownership

**What it is:** The system trusts whatever "previous skill ID" it receives in the job without verifying it belongs to the same project or flow.

**What happens:** If a wrong or outdated ID is passed, system looks for output from a skill that may not exist in this project. Finds nothing. Continues silently with empty context.

**Real example:** A warehouse worker is told "get the inventory report from Bay 3." The Bay 3 label was wrong — it belongs to a different warehouse. Worker goes, finds nothing, returns empty-handed. Work continues without the data. Nobody checks if the right warehouse was visited.

---

## 4. Wrong table columns selected → extractor links records wrong

**What it is:** Admin selects which columns from the database to pass to the LLM. If they forget to include ID columns, LLM sees data without being able to link it to existing records.

**What happens:** Extractor creates duplicate records instead of updating existing ones. Database gets polluted with doubles.

**Real example:** You hand a new accountant a list of client names but no account numbers. They receive payment for "John Smith" — but there are three John Smiths. They create a new account instead of crediting the right one. Three John Smiths become four.

---

## 5. Wrong entity name in LLM output → record silently not saved

**What it is:** LLM must output the exact entity name that matches the database model. If it outputs a slightly wrong name (plural vs. singular, different capitalization), system quietly skips saving that record.

**What happens:** Records that should be created never appear in database. Flow continues like nothing happened. No error shown anywhere.

**Real example:** A form needs the field labeled exactly "Pain Point." LLM writes "Pain Points" (plural). System checks, finds no field called "Pain Points," silently ignores it. The user's pain points are never saved. Next skill looks for them and finds nothing.

---

## 6. No event mapping set up → flow stops with fake success message

**What it is:** When a skill finishes, system checks if Admin configured a "what happens next" rule. If no rule exists, it shows users a "Great work, all done!" message even though the flow was never meant to end there.

**What happens:** Flow silently dead-ends. Admin doesn't know routing was never configured. Users think they're done but actually nothing happened after that skill.

**Real example:** A customer fills out a survey. The survey submission goes to a black hole because the "send to analysis team" step was never wired up. Customer sees "Thank you, we got your response!" The analysis team never receives it.

---

## 7. Circular routing → infinite loop ← CRITICAL

**What it is:** Admin can accidentally create a rule that says "when Skill A finishes, start Skill A again." System has no protection against this.

**What happens:** Skill runs, finishes, starts itself again, finishes again, starts again — forever. Server burns resources. Costs accumulate. Nothing useful is produced.

**Real example:** You set a rule: "After the morning report is written, write the morning report." The system writes a report, then immediately starts writing another report, then another. It never stops until someone manually intervenes or the server crashes.

---

## 8. Two mappings for same event → only one ever runs, silently

**What it is:** If Admin creates two rules for the same event (e.g., two different "next skills" for when Skill A finishes), only the one created earliest in the database runs. The other is silently ignored.

**What happens:** Admin thinks both next skills will run. Only one does. If Admin ever deletes and recreates a mapping, the new one becomes the loser without any notification.

**Real example:** Two departments both submitted requests to be notified when a client approval comes in. Only the first request submitted gets the notification. The second department waits forever, wondering why they were never contacted. Deleting and resubmitting their request makes it even lower priority.

---

## 9. Multiple database events fire but only one triggers next step

**What it is:** When a skill saves multiple types of records (e.g., a persona AND an ambition), each save can fire a separate event. But only the event that was created first (by Admin) triggers the next skill. Other events are ignored.

**What happens:** If Admin created the "ambition route" before the "persona route," next skill always triggers from ambition event — even if the persona event should be the trigger in this case. Other routes never fire.

**Real example:** A factory produces two products simultaneously. Two shipping teams are waiting — one for Product A, one for Product B. System only calls Product A's team (because their contract was signed first). Product B sits on the floor.

---

## 10. Admin cannot see or control which routing rule wins

**What it is:** When two rules compete for the same event, "winner" is determined by which row was created first in database. Admin has no field to set priority, no visual indicator of who wins.

**What happens:** Admin deletes and recreates a rule thinking it will take priority. It actually loses because it now has a newer (higher) database ID. Behavior is unpredictable and invisible.

**Real example:** Two managers both filed expense approval forms for the same budget. The accounting system processes them in order of form number. Neither manager can see who goes first. If a manager resubmits their form, they move to the back of the queue.

---

## 11. No parallel branching — only one next skill ever starts

**What it is:** System can only trigger ONE next skill after a skill completes. Even if Admin sets up multiple "next step" rules for the same event, only the first runs.

**What happens:** Workflows that need multiple teams to start simultaneously are impossible. Only one branch fires. All others are permanently ignored.

**Real example:** After a product launch, you need Marketing, Support, and Legal to all receive a notification and start their processes. System sends it only to Marketing. Support and Legal never get the signal. Their workflows never begin.

---

## 12. Database records never saved when direct skill-to-skill routing exists ← CRITICAL

**What it is:** When Admin sets up "Skill A → Skill B" directly, system transitions immediately to Skill B. But the step that saves Skill A's output to the database (creating personas, ambitions, OKRs) is SKIPPED. It only runs when there is NO direct routing.

**What happens:** Skill B looks up personas/ambitions in the database — finds nothing, because they were never written. Skill B's output is based on an empty database. All downstream data is wrong or empty.

**Real example:** A chef writes a shopping list (Skill A's output). The grocery buyer (Skill B) is supposed to buy what's on the list. But the list was never physically written down — it was in the chef's head. The grocery buyer goes to the store with no list and has to guess.

---

## 13. JSON output uses wrong key names → nothing gets saved

**What it is:** System only recognizes specific key names in the LLM's JSON output. If LLM uses different names (e.g., `"people"` instead of `"personas"`, or `"goals"` instead of `"ambitions"`), the mapper reads the output and does nothing.

**What happens:** All the data the LLM carefully extracted disappears. No records created. No events fired. Flow appears to complete successfully but database is unchanged.

**Real example:** You receive a completed form, but the person used "Full Legal Name" instead of "Name" and "Email Address" instead of "Email." Your system only reads exact labels "Name" and "Email" — so all data is thrown away. A blank record is all that's left.

---

## 14. Parent record fails → child records silently skipped

**What it is:** When records have parent-child relationships (e.g., Pain Point must link to a Persona), if the Persona fails to save, the Pain Points that depend on it are silently skipped — not queued for retry, not flagged.

**What happens:** Persona missing. All its pain points, user needs, and stories are also missing. Next skill reads an empty database. No error surfaced anywhere.

**Real example:** A customer file fails to save (network error). All the orders, invoices, and contact notes for that customer are supposed to link to their file. Since the file doesn't exist, they're all discarded. The customer essentially doesn't exist in the system, but nobody is told.

---

## 15. No transaction → half-written data on failure

**What it is:** When saving multiple records, each one is saved individually. If record 5 fails, records 1–4 already saved remain in the database. There is no "undo everything if one fails" protection.

**What happens:** Database ends up in a mixed state — some records from this session saved, some missing. Next time the flow runs, it may create duplicates or conflicting data.

**Real example:** You're transferring files from one folder to another, one by one. After 4 succeed, the 5th fails mid-copy. Now you have files in BOTH folders but the set is incomplete in both. Nobody flagged it. The archive is corrupt.

---

## 16. Update records with no ownership check ← CRITICAL

**What it is:** When LLM outputs "update record X," system updates whatever record has that ID — without checking whether it belongs to the current project. If LLM hallucinates or uses a wrong ID, it can update another project's data.

**What happens:** Another user's persona, ambition, or OKR gets silently overwritten with wrong data from a different project. Victim project's data is corrupted with no log of what happened.

**Real example:** A contractor is told to repaint room #204. They go to the building, find room #204 — which is in a different tenant's office. They repaint that room without checking whose office it is. The wrong tenant's office gets repainted. Neither the contractor nor the system flagged the mistake.

---

## 17. Skill never finishes — no clear "when to stop" condition

**What it is:** Skills end by outputting a special "I'm done" signal. But if the skill prompt doesn't make it clear when that signal should appear, the LLM may keep the conversation going indefinitely.

**What happens:** Skill never fires completion events. Flow never moves to next step. Conversation is stuck in limbo forever. No timeout stops it.

**Real example:** You tell an interviewer "ask questions until you're satisfied." Without defining what "satisfied" means, the interviewer asks question after question — 30, 40, 50 questions — because they're never sure if they have enough. The candidate sits there and the next stage never begins.

---

## 18. Auto-injected finish instruction conflicts with Admin's skill prompt

**What it is:** System automatically tells every skill "end your response with a done signal when finished." If Admin's skill prompt says something like "always wait for the user to say DONE before ending," both instructions are active simultaneously.

**What happens:** LLM behavior becomes unpredictable — sometimes ends early, sometimes never ends, depending on which instruction it weighs more heavily in a given response.

**Real example:** Employee handbook says "always get supervisor sign-off before closing a ticket." The automated system says "close the ticket when work is complete." The employee gets mixed instructions. Some days they wait for the supervisor, some days they close tickets immediately. Nobody knows what will happen next.

---

## 19. "Done" signal can be triggered by accident

**What it is:** System detects skill completion by checking if the output text contains the phrase `<skill_done/>` anywhere. If LLM writes that phrase as an example, in an explanation, or in sample output — skill is instantly marked done.

**What happens:** Skill ends prematurely. Whatever was generated at that point is treated as final output. Remaining work never happens. Flow advances to next skill too early.

**Real example:** A teacher is explaining to students how to write a sign-off letter. They say the word "APPROVED" as an example. The automated system reads "APPROVED" and immediately processes the unsigned letter as approved. The actual approval step is bypassed.

---

## 20. Token limit set too low → skill crashes, nothing saved

**What it is:** Admin can configure a maximum token (word count) limit per skill. If context (database data, previous outputs, conversation history) is too large for that limit, the AI API rejects the request entirely.

**What happens:** Skill fails. No output generated. No records saved. Flow stops. User sees an error or a silent dead-end.

**Real example:** You hire a consultant and give them a 10,000-page briefing, but their contract only allows 1 hour of reading time. They reject the engagement entirely — the project can't start. If you'd given them a summary, they could have started immediately.

---

## 21. No size limit on database context → token costs explode

**What it is:** When Admin configures which database tables to inject into the LLM, ALL records from that table are fetched and sent. No maximum. A table with 500 personas sends all 500.

**What happens:** Token cost per request multiplies with data size. Context window can be exceeded. Large projects become unusable. Each AI call becomes extremely expensive.

**Real example:** Every time a sales rep makes a phone call, they are handed the entire company's customer database — all 50,000 records — to reference. They can't even carry it. Most is irrelevant. The phone company bills by the minute, so each call costs 100x more than it should.

---

## 22. Knowledge base only works for two hardcoded skills

**What it is:** The system has a fixed list of only two skills allowed to receive knowledge base content. Any new skill Admin creates will never receive knowledge base content, regardless of how it's configured in the Admin panel.

**What happens:** Admin creates a new skill, links it to a knowledge base, but the skill never receives that knowledge. LLM answers from general training only, ignoring the expert guidance Admin prepared.

**Real example:** Company has a training library. The HR policy says only employees named "Alice" and "Bob" can access it. New employee "Carol" joins and is supposed to use the library — but the policy was never updated. Carol has no access. Nobody notices.

---

## 23. Knowledge base error crashes entire skill — no fallback

**What it is:** If the database query for knowledge bases fails (network hiccup, DB overload), the system throws an error and the entire skill invocation fails. Knowledge base is optional information — it's not required for the skill to work — but failure treats it as required.

**What happens:** Users get an error for a knowledge base database issue. Skill never runs. The actual work — answering a question, generating output — never happens.

**Real example:** A consultant is about to give advice. They try to get the reference manual from the bookshelf. The shelf breaks. Instead of giving advice from memory, the consultant says "I can't work today, the bookshelf is broken." Client gets no service.

---

## 24. Wrong knowledge base injected due to loose topic matching

**What it is:** Knowledge base is injected when user's message contains the topic word anywhere — even if unrelated. Example: KB about "project management" injects when user says "I need to manage my expectations about this project."

**What happens:** LLM receives irrelevant expert guidance. Responses are confidently wrong — mixing real expertise with mismatched context.

**Real example:** A librarian injects the "Cooking Basics" reference book whenever a customer mentions the word "recipe." A customer asks "Do you have a recipe for success in business?" and gets handed a cookbook. The customer reads it and gets irrelevant advice delivered with full confidence.

---

## 25. Skill prompt and knowledge base content contradict each other

**What it is:** Knowledge base content and Admin's skill prompt have the same authority level. LLM cannot tell which to prioritize. If they say different things, LLM picks inconsistently.

**What happens:** Same question, different session, different answers. Users notice inconsistency. Support team can't reproduce issues. Trust in system degrades.

**Real example:** Employee handbook says "always offer a refund on defective products." The training manual says "never issue refunds without manager approval." Customer service rep follows whichever document they happened to read last. Some customers get instant refunds, others are escalated. Nobody can predict which.

---

## 26. Greedy regex captures wrong or merged JSON blocks

**What it is:** System looks for JSON in LLM output by scanning for `{` to `}`. If LLM outputs two separate JSON blocks (e.g., debug info and actual data), the scanner grabs everything from the first `{` to the last `}` — merging both blocks into one broken JSON.

**What happens:** JSON parse fails on the merged garbage. No data saved. No next skill triggered. Flow stops.

**Real example:** You receive a letter with two separate tables of data. Your scanner is set to capture "from first column header to last table footer." It merges both tables into one giant confused layout. The merged data makes no sense. Your accounting system rejects it. Nothing gets processed.

---

## 27. Token budget check has race condition → limit exceeded by concurrent users

**What it is:** When a free-tier user hits their token limit, system checks usage BEFORE running the skill. But if two requests arrive at exactly the same time, both checks happen simultaneously — both see usage just under the limit — and both proceed. User ends up 2x over limit.

**What happens:** Free users can bust their budget unpredictably. If 10 tabs open simultaneously, 10x budget consumed in seconds. System has no atomic lock.

**Real example:** A concert has 1 seat left. Two people call the box office at the same moment. Both agents check inventory simultaneously — both see "1 seat available" — both confirm the sale. Two people show up with valid tickets to the same seat.

---

## 28. Failures are invisible to Admin

**What it is:** When things go wrong (wrong entity name, failed ref, broken mapper, JSON parse error), errors are written to server logs and internal job stream — but there is no Admin dashboard, no email alert, no panel that says "Step 3 failed and here's why."

**What happens:** Admin sees the flow stopped but has no idea where or why. They need to manually search server logs. Most Admins don't have server access. Issues remain unfixed because they're undetectable.

**Real example:** A factory has 20 machines. Any can fail silently. The only signal is that finished products stop coming out the end. The floor manager doesn't know if it's Machine 3, 11, or 17. There's no dashboard, no alarm, no warning light. They have to walk the entire floor to find the problem.

---

## 29. Source map with multiple skills + `@previous` drops all other skills ← NEW

**What it is:** Admin can configure a skill to read output from multiple previous skills — say, Skill A and "the previous skill." But if a "previous skill" ID is provided, the system reads ONLY that previous skill's output and completely ignores Skill A.

**What happens:** Skill receives only one source of context instead of all configured ones. Any data from Skill A is silently excluded. LLM has incomplete information.

**Real example:** A reporter is told to write a story using two sources: their notes from last week AND today's interview. When today's interview arrives, the editor says "you have today's interview, use that." The reporter writes using only today's interview. Last week's notes — which had key background facts — are never referenced.

---

## 30. Latest structured extract fetched regardless of which skill created it ← NEW

**What it is:** When reading a previous skill's structured JSON output, system grabs the most recently saved JSON from that conversation — without checking which skill actually created it.

**What happens:** In multi-skill conversations, Skill C may receive Skill B's JSON when it actually needs Skill A's JSON — simply because Skill B ran more recently.

**Real example:** A manager asks their assistant to pull the latest report from the filing cabinet. The assistant pulls the most recent document — which is an unrelated HR memo filed 10 minutes ago. The financial report the manager needed was filed yesterday. The assistant just grabbed whatever was on top.

---

## 31. Next skill triggered by database event receives empty message ← NEW

**What it is:** When a database event (like "persona saved") triggers the next skill, that skill is started with a completely empty message — no text, no content, nothing.

**What happens:** If the next skill's prompt says "based on what the user asked, do X," it has no user message to work with. LLM has no starting point. May produce generic, blank, or confused output.

**Real example:** After saving a customer's file, the system automatically routes it to the analyst. But the handoff note is blank — just an empty envelope. The analyst opens it, finds nothing inside, and has to guess what analysis is needed.

---

## 32. PDF generation without done signal → flow permanently stuck ← NEW

**What it is:** Skills can generate a PDF and also signal they're complete — but these are two separate signals. If LLM only outputs the PDF signal without the "I'm done" signal, PDF is generated but skill is never marked complete.

**What happens:** PDF appears successfully. User downloads it. But the flow never advances. Next skill never starts. Session is permanently stuck — looks fine on the surface.

**Real example:** An employee finishes their report and prints it. They give the printout to the client. But they forgot to click "Mark Complete" in the task system. The manager sees the task as open, the next team never receives the handoff notification, and the project stalls — even though the actual work is done and the client has it.

---

## 33. Configuring wrong table in source map could expose other users' data ← NEW

**What it is:** Admin can configure which database table to pull into a skill's context. System assumes all tables have a "project" filter. Some tables (like User profiles) don't belong to projects — they belong to the whole platform.

**What happens:** If Admin accidentally configures a system table, all records in that table could be returned — across all projects, all users. Sensitive user data gets injected into an LLM context.

**Real example:** A bank teller is supposed to pull "this customer's account records." They accidentally request "all employee records" instead. Because the employee system has no branch filter, they receive the HR records of every employee in the company. This data gets read into a customer-facing context.

---

## 34. Generic mapper always fires same event, blocking precise routing ← NEW

**What it is:** When the generic mapper saves records (personas, ambitions, etc.), it always reports back one fixed event: "structured extract created" — regardless of what was actually saved. Admin cannot route differently based on whether a persona was created vs. an ambition was created.

**What happens:** All generic mapping outcomes look identical to the routing system. If Admin wanted "if persona created → go to Skill X, if ambition created → go to Skill Y," it's impossible with the generic mapper. Both always trigger the same path.

**Real example:** A warehouse receives deliveries. Regardless of what arrived — chairs, computers, or medical supplies — the system always logs "Delivery received." The team waiting for medical supplies has no way to know if their shipment arrived specifically. Everyone sees the same generic notification. Precision routing is impossible.

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
