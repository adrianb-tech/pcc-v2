# PCC Rebuild — Project Plan

**Managing senior developer:** Mica. **Client:** adrian. **Date:** 17 November 2026.
**Status:** preliminary work first. No new code until the spec and the test environment are ready.

---

## 1. The job

Rebuild the PCC Tampermonkey system from scratch as three scripts — the Brain, the Hand, the Keys — built to a written spec, proven in a faithful test environment, and delivered needing the fewest tweaks possible.

The old system stays in maintenance mode (critical relief only) until the new version passes the rig and your live test. Then it is retired. The cutover happens when the new version is proven, not when the rebuild starts.

**What "done" means** (the delivery standard is §8): the spec is complete, the rig is green on every v1 flow, the speed budget is met, the independent check passes, the privacy review passes, and you run the acceptance test live on a real clinic day and rule it good.

---

## 2. Roles

- **Client (you).** Rulings, verdicts, acceptance. You decide scope, tile rules, and whether it ships. You are the acceptance test — the rig proves it works, your verdict proves you like it.
- **Managing senior developer (me).** Architecture, spec, build, test, delivery. I originate the plan, the designs, and the code. I push back when a decision would hurt the product (§10). I bring you decisions with a recommendation, not problems without one. I know every angle before I start building (§4).
- **The crew** (from the PCC charter, adapted to the rebuild):
  - **Fork** — fixtures. Every capture becomes a permanent test fixture before its fix ships. No fix is proven except against its own reporting capture's fixture.
  - **Ear** — independent testing. A separate pass that did not build the change under test. Owns the gate and the two opening lists (closed, fixture-tied / still open). Nothing ships on the builder's own test run.
  - **Rest** — privacy review with a veto. No resident names or identifiers stored anywhere; nothing phones out; captures handled only in redacted form. A veto stops the drop.
  - **Copyist** — the record. The ledger, the master key, the spec, and the packet contract kept current as work lands. One tight truth-file per project — any fresh room starts from one page, never from a chat's history.
- **The rig** — the test environment (h274 replay). It is the only place a fix is proven before it reaches your clinic. It replays recorded real pages in a real browser.

---

## 3. Phases

Each phase has an exit line. A phase is done when its line is true — not before. No phase starts its build work until the previous phase's exit line holds.

### Phase 0 — Discovery: know every angle before building
What happens: the discovery checklist (§4) — tiles, the real PCC environment, your workflow, your laws, the current system as reference, the data model, the known unknowns. I read the record and I ask you what only you can answer.
**Done when:** every item in §4 is either known and written down, or explicitly marked unknown-with-a-plan (what would settle it, and whose job that is).

### Phase 1 — Scope freeze
What happens: v1 is defined — the smallest complete product. Everything else goes on a parked list, written down, not forgotten. My recommended v1 is in §7; the ruling is yours.
**Done when:** what v1 must do fits on one page, and the parked list exists.

### Phase 2 — Spec
What happens: the tile review continues — you name the tiles one at a time, I state my understanding, you correct it, it goes in the spec. The shared machinery gets specified the same way (identity, verdicts, queue, scheduler, flash, G, H, TYPE filter).
**Done when:** every v1 tile has a page (input, output, red rule, transfer rule), the shared machinery is specified, and the open questions are listed — not hidden.

### Phase 3 — Test environment
What happens: the replay rig grows from M1 + T1 to cover every v1 flow. A speed budget is set (I propose the number, you rule). Every bug you ever reported gets a test.
**Done when:** the rig covers every v1 flow, the speed budget is written down, and M1 + T1 are green.

### Phase 4 — Architecture
What happens: the three-script design is written down with its contracts — what each script owns, what it may read, what it may write, and what it must never do. The data model is fixed (one identity module). Every old failure mode gets a named prevention.
**Done when:** the design document exists and each old failure mode has a named prevention in it.

### Phase 5 — Build, in slices, each gated
What happens: the three scripts are built one slice at a time — identity first, then verdicts, then queue, then tiles, then keys. Each slice passes the rig before the next starts. No slice is built on an unproven slice.
**Done when:** every slice is green in the rig.

### Phase 6 — Test and harden
What happens: the full regression suite runs. The speed budget is measured. Ear runs independently. Rest runs. Anything red stops the line.
**Done when:** the suite is green, the budget is met, Ear passes, Rest passes.

### Phase 7 — Delivery and cutover
What happens: install lines delivered (replace-or-install, with version and link on the same line). You run the written acceptance test live on a real clinic day. The cutover checklist runs. The old scripts are retired only after your verdict.
**Done when:** you rule it good live, and the old scripts are retired.

### Phase 8 — Aftercare (fix window)
What happens: the first live week will find things the rig cannot see (there is no sandbox — §9). A short fix window after delivery, each fix with a fixture first, tweaks counted and closed.
**Done when:** the live-found issues are fixed and the tweak count is closed out.

---

## 4. Discovery — everything I need to know before building

This is the "know every angle" phase. It is the work that makes the build fast — a build that starts before this is done is a build that gets rewritten.

### 4.1 The tiles (the spec)
3 ruled, 6 unruled. Ruled: re-entry, age/sex, allergies (your words, in PCC-SPEC.md §1). Unruled: room, weight, BIMS, relationships, psych meds, diagnoses (code behavior recorded as NOT your rule, in PCC-SPEC.md §2). The review continues — you name them one at a time, I state my understanding, you correct it. BIMS is problem #1 and gets ruled first among the unruled, because every other tile's transfer rides the same machinery BIMS exposes.

### 4.2 The real PCC environment
**What I have.** Recorded captures: TREE-1959 (Bedford assessments list), TREE-1203 / TREE-1306 (Dash), TREE-1304 (Profile), TREE-0616 (CNR follow-up form), TREE-0648 (history popup), TREE-0652 (Progress Notes), TREE-1535 / TREE-1537 (Vitals), TREE-1616 (Orders), TREE-2002 (Question History), TREE-0446 (header), TREE-0755 (mega-menu), TREE-1240 (demographics), TREE-1636-2 (Boro Park list), TREE-1649 (Crown Heights list), TREE-0502 (TYPE select). Plus the 2026-11-16 Dashboard screenshot (Invega Sustenna case).

**What I don't have (captures owed).** A CNR/Saints assessments list (settles the Score-1.0 question and the facility name-scan). A chart-side capture exposing `getCurrentClientIdNumber()`'s live value (settles whether the chart's patient number matches the form's — the transfer drop's live unknown). Filled Discharge Date. BIMS wrong-placement. Pipe 12 (Progress Notes View All scrolled to your note). SELF resident's Dash. A Results capture. Big-list med/behavior screenshots.

**No sandbox.** There is no PCC training account with fake patients that I know of. The rig replays recorded pages — it proves our scripts' behavior on real page shapes, but it cannot test live PCC behavior: AJAX timing, the pref-save round trip, form submits beyond stubs, PCC's own JavaScript. That is a real limit, stated plainly in §9. If a sandbox exists, getting access to it is the single highest-value thing on the discovery list (§6, item 4).

### 4.3 Your workflow, written as the acceptance test
The rebuild is tested against what you actually do, not what I imagine. The flows the rig must cover, from the record:
- Dashboard-click a tile, open the follow-up form, the value lands. Do nothing, the note stays unchanged. (M1 — green.)
- TYPE filter: press 1, the filter lands on psych and stays — at fast and slow PCC speeds. (T1 — green.)
- H: press H on a follow-up form, HPI + MSE + Impression fill from history. On a new note, H has nothing to fill.
- G: press G, only red tiles queue. (The write path in a headerless follow-up form is proven dead live — Ear 4. Whether the new version builds a G-in-form write path or declares Dashboard-click the supported flow is your ruling, §6 item 7.)
- NEW-form popup: open a new consult, the opener path carries identity.
- Keypress flows: 1/2/3 filter buttons, F (View All), S (copy name + room), O/P/N/A, Escape-blur, F14 save.
- Tab navigation: last-tab memory (chart reopens on the tab you left), F13 to assessments.
- Sticky TYPE: the filter lands where you left it, never fights you, never saves a retired type.
- Speed: the page is quiet shortly after load; a click does almost no work.

**Gaps in my knowledge of your workflow.** The exact order you work a chart at each facility (which tiles you click first, when you press H vs. G, how long between Dashboard and form open — the record says minutes, which is why the 30-second queue window broke your flow). The facilities' differences beyond what the code encodes (Boro Park vs. Crown/Bedford vs. CNR/Saints — TYPE behavior, consult-opening, allergies-in-note). I will ask these as short questions during the spec phase, not as a questionnaire now.

### 4.4 Your laws (the design constraints)
These are not preferences — they are the spec's hard constraints. Privacy first, then accuracy, then speed, then intuitive, then beautiful. Nothing acts without your keypress; keys dead while typing; `0` is the kill switch; no background timers, pollers, or MutationObservers. Nothing writes to your note unless you press something. Nothing fights you — the system never overrides, undoes, or works against what you chose. Nothing changes except for the change you request. Smooth Arrival: everything lands once, in its final position at its final size; nothing grows, flickers, or moves. A tile presents itself once, at exactly the size needed to view all its content. Honesty over optimism: no "fixed" without verification against your own failing capture; what a drop does NOT fix is named first. A visual change has to be visibly different or it doesn't ship.

### 4.5 The current system as reference
The old scripts are the baseline the new system must match or explicitly change. The new version must not silently drop a behavior you rely on — H, the F badge, the number badges, sticky TYPE, last-tab memory, S, G, the readmission flag, the quarterly rule. The ledger and the master key are the record of what exists; the spec is where each behavior is either carried over (with your ruling) or explicitly retired (with your ruling). Nothing is dropped by accident — dropped behaviors are listed, with your say-so.

### 4.6 The data model
What a "patient" is: the chart number (what you see), the stable numeric client PK (what the form carries as `assessClientId` / `GLOBAL_CLIENT_ID`), and the rotating EID token (what the URL carries — never an identity). The packet (`tmTileChart`): what the Brain publishes, once, dirty-gated. The queue: a user-action artifact only — written by a tile click or G, never by a script itself. The verdicts: one publisher, Core's verdicts engine, now the Brain's verdict module. PACKET-CONTRACT is the starting point; the rebuild fixes the model so there is one identity module and every script asks it.

### 4.7 The known unknowns (risk register)
- Chart `getCurrentClientIdNumber()` vs. form `assessClientId` — unproven live. Settles only by your live test or a chart-side capture.
- EID token uniqueness across patients — not capture-proven. Bounded by the value check and the clock rules.
- Capture staleness — captures are snapshots; a PCC UI change silently invalidates them. The rig fails loudly on missing elements, but nothing alerts when a capture goes stale.
- No sandbox — §4.2.
- G-in-form write path — proven dead in follow-up forms; NEW-form popup header unproven.
- The self-heal — the page re-renders psych ~3.4s after a tick-submit from the late-landed pref. The fix is one-submit authority; the rig (T1) is the proof.
- The 150ms race — the tick submits 150ms after a change with no pref-save; a save slower than that loses. Same fix.
- h262 E-phase flake (~50%, pre-existing timing flake) — the rig's E-phase is flaky; the repair's own tests are deterministic. The flake is documented, not hidden.

---

## 5. Tools

### What exists (I use these, I don't rebuild them)
- **The replay rig** (h274, Playwright Chromium): serves recorded real pages, injects the current scripts in Tampermonkey order, runs flows with real trusted clicks. M1 (transfer) 18/18, T1 (TYPE race) 38/0 over four runs.
- **The harness** (jsdom fixtures h262–h272): unit-level fixtures, each seeded from a capture you sent. Fast, but no layout and no real PCC — the rig is the authority, the harness is the workbench.
- **The spec draft** (PCC-SPEC.md): 3 ruled tiles, 6 unruled, shared machinery, 30 open questions.
- **The record**: PIPE-LEDGER, PCC-Master-Key, PACKET-CONTRACT, the frozen shelf copies, the GitHub repo (`adrianb-tech/pcc-scripts`) with SHA-verified pushes.
- **The crew process**: build → Fork → Ear → Rest → ship + Copyist. Every bundle drop gated on booting the built artifact.
- **Node, GitHub, Playwright**: the machine and the repo.

### What I need to build
- Rig flows for every v1 flow (§4.3): keypress flows (H/G/F), NEW-form popup, tab navigation, sticky TYPE, S copy, and the G-in-form decision once you rule it.
- A speed budget: a number for time-to-quiet and a number for settled clicks, measured by the rig. I propose the numbers; you rule.
- The three scripts (§7), the regression suite, the delivery checklist, the acceptance test list.

### What I need from outside (not buildable by me)
- A PCC sandbox / training account, if one exists (§6, item 4).
- The owed captures (§6, item 3).
- Your live verdicts (§6, item 5).

---

## 6. What I need from you

You are the client. These are the inputs only you can give. Each one says why it matters and what happens if it is missing — so you can see the cost of skipping it, not just the ask.

1. **Scope ruling (v1 in / out).** My recommendation is in §7. Why it matters: the scope decides everything downstream — the spec's size, the rig's flows, the build's size. If it is missing: I cannot freeze the scope, and the build keeps growing.
2. **Tile rulings (6 unruled).** Room, weight, BIMS, relationships, psych meds, diagnoses — one at a time, at your pace, the way the review has run so far. Why it matters: a tile without your rule is a tile I would have to guess, and guessing is how the old system got its wrong rules. If it is missing: the tile ships as "code behavior, not your rule" — and I will say so, not pretend otherwise.
3. **Captures owed.** RECEIVED 2026-11-19: the CNR assessments list (`~/workspace/user/files/pcc-v2-capture-0807.html` — 30 Complete, 3 Incomplete, NEW button present) AND the three-step CNR flow (`pcc-v2-capture-0811.html` forms page → `pcc-v2-capture-0811__1.html` MDS page → `pcc-v2-capture-0811__2.html` the opened consult form "Consult Form - Psychiatry 4 - X 1", 4 textareas, question keys Cust_2_I_1/I_2, assessClientId present). The Score-1.0 question is settled by his live screenshot 2026-11-19 (not the 0807 capture — it has no "In Progress" row): the open consult is Status "In Progress" + Score "1.0". Status "Incomplete" is a different state (older consults started and never finished, empty Score). Still owed: the chart-side `getCurrentClientIdNumber()` capture (lower priority — transfers removed from v1), then the rest of §4.2. Why it matters: every capture becomes a fixture; a missing capture is a shape the rig cannot test. If it is missing: that shape stays unproven until your live test finds it.
4. **Sandbox: ask whether PCC offers a training account — CLOSED (his, 2026-11-19).** He can't get one and doesn't know who to ask. So there is no sandbox. The rig plus his live verdict is the test environment, and the fix window (§8) carries the residual risk. The captures matter more now — they are the only real PCC pages the rig has.
5. **Live verdicts at each gate.** The acceptance test is a written list of flows you run live (§8) — not "try it and see." Why it matters: your verdict is the only proof that counts. If it is missing: nothing ships, because nothing is proven.
6. **Speed budget ruling — RULED (his, 2026-11-18).** Navigation feels instant; getting information takes 0.5 seconds. The formal gate is in the full build; the numbers are the rebuild's design target now.
7. **G-in-form decision.** Build a G write path for headerless forms, or declare Dashboard-click the supported G flow. Why it matters: the rig cannot test a flow whose design is undecided. If it is missing: G-in-form stays as it is — dead in follow-up forms, working where tiles exist.
8. **Bedford allergies ruling.** October said never red at Bedford too; the November review reopened it. Why it matters: the spec cannot carry both. If it is missing: the spec carries the conflict openly and the code keeps the current behavior (exempt at Bedford) until you rule.
9. **Invega — DROPPED (his, 2026-11-18).** "Forget Invega. That shouldn't be in this remake." The patch (freqOf monthly pattern + Sustenna qualifier + the frequency/indication calls) does not go into the rebuild, and the relief-lane tap is closed. The lesson stays: a monthly depot ("one time only" + "1x per month") must never be silently dropped — the rebuild's med builder handles that shape by design, and the h272-invega fixture stays as the test for it.
10. **Your time.** Tile-review sessions and live-test days. Why it matters: the schedule depends on your clinic days. If it is missing: I work around your days, never through them — the build waits for your rulings rather than guessing them.

---

## 7. Architecture — my recommendation, your ruling

### The three scripts
1. **The Brain** — everything that reads PCC and decides: identity, gather, verdicts, queue, scheduler, tiles, flags, list badges. One scheduler, one publish, one identity module. Runs on chart and list pages.
2. **The Hand** — the form-side writer: reads the queue, applies to the note, H fill, blank-form skeleton. Small and separate on purpose — it is the code that touches your note, so a change to the Brain can never accidentally write to it.
3. **The Keys** — every keybinding, tab, badge, and sticky filter, with one settings table per facility instead of three scripts per facility. Runs everywhere keys matter.

The CSS (today's Layout styles) folds into the Brain: the Brain runs at document-start, injects its style immediately, and does DOM work on DOMContentLoaded. No fourth script is needed.

### The contracts (what each script may and may not do)
- The Brain publishes one packet, once, dirty-gated. It never writes to a note field. It never submits a form — the scheduler is the only submit authority.
- The Hand reads the queue and writes to note fields, only on your keypress or click. It never decides red. It never gathers.
- The Keys dispatch input. They never decide red, never gather, never write to the note — they call the Brain and the Hand.
- Identity: exactly one module answers "which patient is this." Every script asks it. No script figures out the patient on its own.

### The design rules that prevent the old failure modes
- **One scheduler.** All timed work runs on one schedule. No script has its own ladder, burst, or tick. (Old failure: seven independent timers; the Pages tick racing PCC's pref-save.)
- **One publish.** The packet is published once, when dirty. No storage-event cascade. (Old failure: publish on every click and keydown.)
- **Memoized identity.** The patient is resolved once per page load and cached. No re-scan per click. (Old failure: two full 25k-element scans per click.)
- **One-submit authority.** Exactly one path submits the form, and it never submits while a pref-save is in flight. (Old failure: the 150ms tick race.)
- **Writer isolation.** The Hand is the only writer to the note, and it is small. (Old failure: queues auto-writing without a keypress.)
- **Tiles never re-plant.** A tile is planted once, at its final size, and never re-rendered under your finger. (Old failure: the duplicated view toggle, the re-planting band.)
- **No background work.** No timers, pollers, or MutationObservers except the single bounded scheduler. (Old failure: the 8-second badge burst re-arming on every click.)
- **Version discipline.** Tampermonkey never downgrades — rollbacks go out with a higher version. Frozen shelf copies. SHA-verified pushes. Every drop gated on booting the built artifact.

### My recommended v1 scope (your ruling decides)
**In:** the six tiles (age/sex, allergies, BIMS, psych meds, diagnoses, relationships) + the re-entry flag + transfers (Dashboard-click, and G where the write path exists) + H fill + keys, tabs, sticky TYPE, last-tab memory + speed (one scheduler, one publish, the budget met).
**Parked:** the floating patient panel, Q-walk, Top 5 recommendations, the search refine box, fuzzysort/vitest wiring, Ollama phrasing, more navigation buttons, the full patient-context proposal, the blank-form skeleton unless you rule it in during the spec. Also parked pending your ruling: the summary page (§11.1 — v1 candidate) and the note-writing assistant (§11.2 — v2).

### Scope ruling — his words, 2026-11-17 (the floor)
The frozen one-page scope is `PCC-V1-SCOPE.md` (2026-11-18): the floor, the strip list, the open items. This section is the ruling record behind it.
**Keep — what he needs to work now:** the Dash (works well); psych meds tiered to top and opened, same for psych diagnoses; all meds and all diagnoses visible; the med extractor; all diagnoses on the Progress Notes page; shortcuts A, S, D, F, H, 1, 2, and the 4 tab shortcuts (H/P/O/N); the popups with all information already in them (admission, follow-up, other, dates, form info); the psych meds tile and the diagnoses tile (the transfer mechanism he uses — the tile consolidates split orders into one line).
**Strip:** the other tiles (age/sex, allergies, BIMS, relationships, room, weight, re-entry flag as surfaces — the DATA stays in the Brain for the summary page + note draft); the behavior tile in Progress Notes; Dot; G (tile click stays); the Vitals/weight script; Hide-tabs' hiding (unhide is fine as long as the buttons stay where they are); the floating panel, Q-walk, refine box, more buttons (already parked).
**Open:** (a) confirmation that the tile-strip means surfaces go, data stays — and BIMS specifically, since it is problem #1 (the TYPE-filter race stays in scope regardless — it is a filter problem, not a tile problem); (b) the Readmission flag's red box — strip, with the NEW/readmission classification carried by the summary page + note assistant; (c) whether the 3 (MD) TYPE badge stays — he listed 1 and 2; (d) the summary page (v1 candidate) and the note assistant (v2) — his call still pending.
**Transfer decision (his, 2026-11-17):** the transfer feature does not work now, so it is removed from all tiles. Only the copy function remains — he pastes the value into the note himself (the S-button pattern, already proven live). The queue, Copy-to-note's appliers, and G go. The summary page's "Send to note" (review first, same patient, on his keypress) is the replacement transfer mechanism, if the summary page is ruled into v1. Verification owed: paste a tile value into a note live (Cmd+V in Helium).
**Buttons 1 and 2 (his, 2026-11-17):** there is a problem with forms — buttons 1 and 2 (the TYPE filter badges). He can live with removing them for now (v1 scope). **Sticky TYPE (his, same day):** PCC remembers the TYPE filter on its own (server-side user preference). It only stopped remembering when our scripts broke it (the Apply-click sync submit + the Pages tick-submit beating the async pref-save). So the sticky TYPE machinery goes — the rebuild does not rebuild it. The design rule is: our scripts never submit the form; PCC's native preference save does the remembering.
**Two more keeps (his, 2026-11-17):** (1) the assessments-list ordering — for new patients and when on All, psych consults first, then BIMS consults, then everything else. (2) all the F badges in the right spots.
**Summary page (his, 2026-11-18):** PARKED for v2. V1 is the floor only — copy + paste is the only transfer in v1.
**BIMS tile + readmission flags (his, 2026-11-18):** strip both, for now. BIMS data stays in the Brain. The flags' red box and verdict chips go — but when he creates a new note, it still loads appropriately (the right Type and defaults); the classification is still computed in the Brain, only the surface is gone. Open: what the MD badge is (he asked) — the "3" button filtering the list to the MD form type; and the verify + speed-budget items (he asked for explanations).
**Frozen (his, 2026-11-18):** the three open items (the 3 badge, the verify tile, the speed budget) are out of the frozen scope, back in the full build (v2) — on the condition that they always work and never fight him. Phase 1 (Scope freeze) is done.
**BIMS-and-psych combined view (his, 2026-11-23):** the Forms list showing both BIMS and psych consults, nothing else — v2. (PCC cannot do it natively; it would load "All" and hide the rest, inheriting the "All" load cost.) BIMS in v2 (confirmed the same day).
**Repo name — RULED (his, 2026-11-19):** `pcc-v2` is fine. Set it up now; the spec is the first thing in.

---

## 8. Delivery standard — "least tweaks necessary"

**Definition of done.** The spec is complete. The rig is green on every v1 flow. The speed budget is met. Ear passes independently. Rest passes. You run the acceptance test live on a real clinic day and rule it good. The cutover checklist is complete. The old scripts are retired.

**The acceptance test.** A written list of flows you run live — the §4.3 flows, with the exact chart and the exact expected result for each. Not "try it and see." You check each one off, or you mark it failed with what happened. That list is written before delivery, not after.

**The fix window — the honest part.** The first live week will find things the rig cannot see, because there is no sandbox. I plan for it instead of pretending it away: a short fix window after delivery, each fix with a fixture first (a capture from the live failure, turned into a rig flow), tweaks counted and closed out. The goal is the fewest tweaks, not zero. Zero is a promise I will not make — it would be the same optimism the old system was built on.

**The cutover rule.** The old scripts stay your working tool in maintenance mode (critical relief only) until the new version passes the rig and your live test. They are retired at cutover, not at kickoff. If the new version fails your live test, you keep working on the old one while I fix it — you are never left without a tool.

---

## 9. Risks and honest limits

- **No sandbox.** Replay cannot cover live PCC behavior (AJAX timing, pref-save, submits, PCC's own JavaScript). Residual risk is carried by the fix window and your live verdict.
- **Live unknowns.** The chart-vs-form client-number match and EID uniqueness settle only by your live test or the owed captures. Until then the design refuses safely (never lands a wrong-patient value) rather than guessing.
- **Capture staleness.** Captures are snapshots. A PCC UI change silently invalidates them. The rig fails loudly on missing elements, but nothing alerts when a capture goes stale. Mitigation: re-capture the v1 flows before delivery.
- **Timeline.** I will not give you a date until the spec is done. The schedule depends on your rulings (scope, tiles) and on what the discovery phase finds. After the spec is complete I will give you a real estimate with a range, and I will say what would move it.
- **The old system.** It stays your working tool in maintenance mode until cutover. If it breaks your day, the relief lane (§6) is the answer — small, targeted, fixture-first.

---

## 10. My pushbacks — where I will push back

1. **Hard abandonment on day one.** No — maintenance mode until cutover. You agreed ("fair"). You are never left without a working tool while the new one is being built.
2. **Scope creep in v1.** The smallest complete product. Everything else is parked, written down, and decided by you — not by me, not by momentum.
3. **A date before the spec.** I will not estimate a build before the spec exists. After the spec, you get a real estimate with a range.
4. **Zero tweaks.** I will not promise it. I will plan a fix window and count the tweaks instead.
5. **Skipping the rig for a "small" change.** No change ships without the rig, however small. The S-button outage was a one-line change.
6. **Guessing a tile rule.** If you have not ruled it, the spec says so. I will not present code behavior as your rule.
7. **Carrying the old implementation forward by default.** The rebuild keeps your rules and the lessons (what broke and why). The mechanisms — how the old code did it — are forgotten unless they earn their place against something better, faster, or more beautiful. Nothing carries forward by default. (His instruction, 2026-11-17.)

---

## 11. New capabilities (added 2026-11-17 — his items, not yet ruled)

### 11.1 One summary page
**What it is:** all information extracted from the chart, analyzed, and placed on one page, so he never has to dig through the chart. The analysis part matters — it is not a dump; it is the chart synthesized into what matters (what changed, what is red, what is missing, what is due).

**Relation to existing work + his answer (2026-11-17):** yes — something similar to the floating patient panel (2026-11-04, mocked), grown into a full page. The panel mockup (`patient-panel-mockup.html`) is the starting point: Follow-up view (name + age/sex only; Psych Meds, BIMS with previous, Behaviors, Last Visit); New Patient view (demographics without repeating age; psychiatric medications only; diagnoses as full names, no ICD-10 codes). His words: the page carries "all the information i need or all the information that was pertinent to a recommendation that is made to me." Design implication: the page is organized around recommendations — each recommendation (the Top 5 recommendations idea: deterministic triggers + his priority tiers; he chooses, the script never acts) carries the information pertinent to it, so he can judge it — plus everything else he needs on the one page.

**What it needs:** the Brain's gatherer + verdicts (it presents what the Brain already knows); the analysis rules (what counts as "changed," "needs attention," "missing") — these are spec rules, ruled by him; a home (a new tab, a page, a panel — his ruling).

**My recommendation:** v1 candidate. It rides the Brain — the rebuild already gathers everything the page needs. But it is a new surface, so it adds scope; the scope freeze decides.
**Ruling (his, 2026-11-18):** PARKED for v2. V1 is the floor only — no summary page, no recommendations surface, no "Send to note"; copy + paste is the only transfer in v1.

**Open questions:** which sections beyond the recommendations? Where does it live? Read-only, or does it feed the note? Printable?
**Vision mockup v1 (ehr-vision-mockup.html, 2026-11-17) — his verdict: dated, not fun to work on, does not inspire him.** Beauty is the standard and it missed. The gray-dashboard look is the old enterprise pattern, not the new one.
**Design reference (his, 2026-11-17): Docker Desktop — "it presents information very cleanly and clearly. it works very fast, almost instant."** The language: bold blue top bar, icon sidebar, suggestion cards, prompt bar, quiet status bar. V2 (ehr-vision-mockup-v2.html) is built in that language.
**Visual parts (adopted 2026-11-18, his go-ahead):** Lucide 1.75.0 icons (inlined as raw SVG in the Brain) + Open Props 1.7.23 tokens (subset only, CSS variables in the Brain's injected style), on the Mac system font. Inter skipped — a font file would inflate the script ~33%.

### 11.2 Note-writing assistant
**What it is:** something that understands his system of writing notes — which he believes is mostly repetitive — so it can help him write the notes. It must understand the visit kind: NEW patient, readmission, follow-up that is stable, follow-up that requires his input, medication changes.

**Relation to existing work:** builds on the transfer machinery (the queue, the appliers, H fill) and on the re-entry classification (the flag already distinguishes NEW / readmission / follow-up). "Follow-up stable" vs. "follow-up requiring input" is a NEW distinction — the signal is undefined (a med change? a BIMS change? a red tile? something new in the chart?). "Medication changes" is a specific trigger (meds added / stopped / dose changed since the last visit).

**Design constraint (his law) + trust staging (his answer, 2026-11-17):** the destination is full writing — if the information is 100% accurate, he is OK with his notes just being written for him. Until trust is earned, he sees the information before it goes into his note. So the automation is trust-gated in stages. Stage 1 (now): the assistant assembles the note content and shows it to him — the summary page is the review surface — and nothing enters the note until he approves by keypress. Stage 2 (later, when accuracy is proven over time): the note is written for him. The bar for moving stages — what proves 100% accuracy, measured how, over how many notes — is an open question for his ruling. The pipeline is one line: Brain gathers and analyzes → summary page shows it → he reviews → Hand writes it on his keypress.

**The language question:** the deterministic part (values from the chart, the skeleton, the classification) is straightforward. The language-generation part is where the Ollama question lives — local models only, "without looking at patient data" (his 2026-10-30 constraint); the agreed framing is the LLM is a thesaurus, not a reader. Whether the assistant may use a local model for phrasing, or must be fully deterministic from the chart + his templates, is his ruling.

**My recommendation:** v2. It needs the summary page (the source it draws from) plus the classification rules plus the language ruling. It is a new capability, not a rebuild of an existing one.

**Open questions:** draft the whole note for him to edit, or fill the repetitive lines and leave the clinical judgment blank? What is the signal that a follow-up "requires his input"? Local model allowed for phrasing, or deterministic only?

---

*Sources: PCC-SPEC.md (356 lines, 3 ruled / 6 unruled, 30 open questions) · h274 replay rig (M1 18/18, T1 38/0) · PIPE-LEDGER · PCC-Master-Key · PACKET-CONTRACT · the 2026-11-16 tile review, transfer drop, and lag probes.*
