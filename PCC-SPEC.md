# PCC-SPEC.md — the rebuild's specification (FIRST DRAFT)

**Status: DRAFT — 2026-11-16.** Step 2 of the senior-dev rebuild plan ("write the spec first — one page per tile"). adrian approved the structural rebuild 2026-11-16 ("Yes, rebuild it properly"). This draft is the starting point, not the final word: **3 of 9 tiles are ruled** (re-entry, age/sex, allergies — from the tile-by-tile review he started 2026-11-16); the other 6 are recorded as code behavior only, awaiting his review one at a time, as he names them. Nothing in this document ships code. Where adrian gave a rule in his own words, it is quoted. Where the code does something he has not ruled, the section says so and does not present it as his rule.

**Versions of record at draft time (per PIPE-LEDGER):** Core 2.11.19 · Copy to note 1.28 (Ear 4 PASS 2026-11-16 ~18:46) · Readmission flag 1.15 · Extractors 1.1.4 · BP Keys 2.26 · Bedford-CH Keys 2.18 · CNR/Saints Keys 1.61 · Hide-tabs 1.28 · Pages 1.2.2 · Grab-all (G) 1.4. Baseline/restore point: Core 2.10.0, frozen, never edited.

**Standing laws that constrain this spec** (see AGENTS.md / MEMORY.md for the full text): nothing acts without his keypress; keys dead while typing; `0` = kill switch; no background timers/pollers/MutationObservers (bounded ladders/bursts in existing scripts are the accepted exception); no script re-asserts a setting he changes by hand; nothing writes to his note unless he presses something; privacy first — redacted captures only, nothing phones out, no resident identifiers stored (per-resident key = chart number only); Smooth Arrival — everything lands once, final position, final size, no growth/flicker/repaint; honesty over optimism — no "fixed/proven" without verification against his own failing capture, and his live verdict is the acceptance test.

**How to read this document.** Each tile has the same shape: Input (where the value comes from) · Output (what the tile shows) · Red rule (when it turns red) · Transfer rule (what click / G does) · Edge cases · Open questions. **RULED** means he gave the rule in the review. **UNRULED** means the section records what the code does today and must not be read as his rule.

---

# §1 — RULED TILES

## 1.1 RE-ENTRY — RULED 2026-11-16

**Input.** PCC's admission display on the chart: three dates — Re-entry / Initial Admission (MDS) / Discharge. A missing date renders as a muted dash.

**Output.** The band tile shows the three dates. **The tile itself does NOT turn red** (his confirmation 2026-11-16 16:45). There are two indicators, separate from the tile:
- **READMISSION** — the big red box on the Forms page + the chip in Core's flag strip (`#tmFlagRow` / `#tmReadmitSlot`).
- **NEW ADMISSION** — the chip (Core shows NEW ADMISSION for a 'new' verdict).

**Red rule — READMISSION.** Re-entry date **on or after** the latest psych form date → red. Before → OK, quiet (`SHOW_OK=false`). No re-entry date → **no verdict at all** (known gap, accepted).

**Red rule — NEW.** His correction (2026-11-16 16:45), superseding Mica's "no psych forms at all" statement:

> "NEW means there is no psych consult at all at boro park, crown, or bedford. at cnr and saints where they open the consult for me, there will be one note opened but that note will be opened and not completed. and that is how you tell it is a NEW patient. otherwise it is a readmission or a follow up."

His detail (16:49):

> "yes, there is a date. the date is usuall on or after the day they were admitted. however, there is also a score. the score should be 1.0 which means it is opened and not yet done. sometimes, they open several consults for the same person by mistake so there will be several consults all saying 1.0 and nothing of any other number which also means it is a new admission."

**Code behavior that implements the rule (Readmission flag 1.15).** `lastPsychForm` records per-row done-ness — a psych row is not-done when its Status cell is "Incomplete" **OR** its Score cell is exactly "1.0" (exact `/^1\.0$/` cell match; the form-version string in a name can never false-fire) — and returns latest DONE date, latest-any date, psychRows, allNotDone, strictFac. `update()`: NEW when no psych rows at all (any facility) OR all psych rows not-done AND facility is NOT Boro Park / Crown Heights / Bedford (name scan mirroring Core's `facilityNameHere`). Strict facilities fall through to the date comparison. Verdict needs stability (two agreeing passes ≥1s; 3s for 'new'); only a published ALERT ends the ~7s burst early; 'new'/'ok' keep re-verifying. Verdict stored as `tmReadmitVerdict` {id, reentry, verdict, lastForm, ts}; 'readmit' also writes `tmReadmitNote`; 'ok' removes a stale note for that date.

**Capture evidence (TREE-1959, a BEDFORD capture).** The assessments-list Score column is EMPTY for every psych consult row, Complete or Incomplete; the only "1.0" is the form version in the name ("Consult-Psychiatry 1.0"). The capture-proven opened-not-done signal is **Status "Incomplete"** (newest consult 10/10/2026 Incomplete, empty Locked Date; all older Complete). A BIMS row in the same capture shows Score "10.0" — the column works; consults never populate it. **Correction (his, 2026-11-19, from a live screenshot).** The opened consult is Status **"In Progress"** with Score **"1.0"** — the highlighted newest row, with the F badge on its edit button. Status "Incomplete" is a DIFFERENT state: older consults that were started and never finished (empty Score) — not the open one. (The 0807 CNR capture contains no "In Progress" row and no bare "1.0" Score — it only shows the older Incomplete rows — so it does not settle this; the live screenshot does. Mica had wrongly settled it as "Incomplete" from that capture.)

**Downstream (verified by Ear, unchanged by the 1.15 drop).**
- **Quarterly is Boro Park ONLY.** BP defaults: last psych note ≥70 days old AND verdict 'ok' → new-assessment Type fills 'Quarterly'. 'readmit'/'new' never qualify.
- **COPY-mode rule is the same everywhere:** readmission → a copied form's Type is set to Initial. The defaults scripts read the `#tmReadmitBox` READMISSION text in the opener's frame tree, NOT the verdict.
- Crown Heights / Bedford: same tile, same flag rules; only the downstream differs (above).

**Edge cases.**
- A Complete row with Score exactly "1.0" reads NEW (Score overrides Complete) — the one shape that can actively misfire; unproven whether it exists in the wild.
- Status "In Progress" (if PCC uses it) counts as DONE.
- A dateless psych row is invisible to the verdict.
- The flag's TR-count cache can return a stale verdict on a Status flip mid-burst.
- Facility gating is a page-text name scan — a stray "Bedford" / "Boro Park" / "Crown Heights" string on a CNR/Saints list page would wrongly force strict mode. **If NEW never appears at CNR/Saints, check this scan first.**

**Open questions.**
- No re-entry date → no verdict at all (pre-existing gap, accepted — but still open).
- The opened-not-done signal at CNR/Saints — SETTLED 2026-11-19 (his live screenshot): Status "In Progress" + Score "1.0" (the highlighted newest row, F badge on edit). Status "Incomplete" is a different state (older consults started and never finished, empty Score) — NOT the open one.
- Live verdict owed: NEW ADMISSION chip at CNR/Saints for a real new patient.

## 1.2 AGE/SEX — RULED 2026-11-16

**Input.** The chart header, e.g. "(86/Male)". The gatherer's `selfData` reads `(\d{1,3})/(Male|Female)` from header text. **Never from the note.**

**Output.** The tile shows the chart's age/sex, e.g. "86M". **The tile is NEVER changed** (his words).

**New-patient HPI template.** His words (2026-11-16 16:54):

> "HPI xx admitted to CNR referred to psych for initial eval will always be the basic statement. for any NEW patient, the only thing that changes in that sentence is the facility and the xx."

**Red rule.** His final wording (16:57–17:00): red iff the word after HPI differs from what's inside the tile — the WHOLE word, sex letter included. "HPI 86F" vs tile "86M" is red. "HPI is not included" in the comparison.

**Transfer rule.** Click the tile or press G → replace that word with the tile value, whatever word is there. A bare "HPI" line gets the value inserted ("HPI 86M").

**Code behavior that implements the rule (Core 2.11.18 + Copy 1.27, harness h270 23/23, Ear PASS 2026-11-16 17:12).** Verdict takes the first token after HPI, strips trailing punctuation, compares whole-word to the chart age/sex. `applyAgeSex` replaces whatever word follows HPI with the tile value (first HPI line only).

**Edge cases.**
- Lowercase "hpi" goes red and the tile can't fix it (same case-sensitivity as the old code; his notes use uppercase).
- The old code compared the age NUMBER only (letter ignored); `applyAgeSex` replaced digits only and kept the note's sex letter; a non-number word replaced nothing; a bare "HPI" line got nothing. All four were the ruled bugs h270 proves fixed.

**Open questions.**
- Live verdict owed: age tile red on a wrong-letter HPI live + tile/G fixing it live.

## 1.3 ALLERGIES — RULED 2026-11-16

**Input.** Exactly from the chart: the gatherer reads `.residentAllergies.residentDetailValue`; `fmtAllergies` formats it. The tile shows that value; click/G fill writes the same value.

**Output.** The chart's allergy list, formatted: "no known (drug) allergies" / NKDA → 'NKA'; splits on `[,;/\n]`; strips trailing "Copy"/"Copied"; penicillin → 'PCN'; joins ', '.

**Abbreviation.** His words (2026-11-16 17:27): "for anything that can be abbreviated, such as penicillin PCN, it should do so." **Penicillin → PCN is the ONLY abbreviation in the code** — it happens in three places (tile display, fill value, comparator `allergySet`: split on commas only, trim, lowercase, penicillin or `\bpcn\b` → 'pcn', sort, join '|'), so "PCN" vs "Penicillins" never goes red.

**Red rule.** His words: "it should only shine red if the note and the chart don't agree. and this is only for the word after the word allergies. and please be mindful that the order of the allergies does not matter." The verdict compares `allergySet(note)` vs `allergySet(chart)` — a set compare, so order doesn't matter. Comparison is only the text after "Allergies" (optional colon) on that line; nothing else in the note is looked at. A note with NO Allergies line, or an empty one, is red. NKA / NKDA / "No known…" normalize to the empty set on both sides.

**Transfer rule.** "it should transfer over for either click the tile OR pressing g." `applyAllergies` needs an "Allergies" line with content after it.

**Facility exceptions.**
- **Crown Heights — CONFIRMED by him (17:29):** "correct: allergies never go in the note at crown heights." The verdict is never computed there.
- **Bedford — OPEN QUESTION.** The code also exempts Bedford (`facCH`/`facBedford` both skip the verdict entirely). Mica asked whether Bedford still holds the exception or it is Crown Heights only now. **Unanswered — record it as an open question, not a rule.** (Note: the ledger records a 2026-10-23 ruling "Allergies NEVER red at Bedford too" — the 2026-11-16 review re-opened it; the review's question governs until he answers.)

**Blank note.** His words (17:29): "in a blank note it should replace the word after allergies with a space in between which is likely xx" — the blank line reads "Allergies: xx" and the transfer replaces "xx" with the chart value (same placeholder pattern as "HPI xx"). If there is NO Allergies line at all, `applyAllergies` returns the text unchanged — nothing lands. The line itself belongs in the blank-form skeleton (§3.7), which is not built.

**Open questions.**
- Bedford: exception or not? (Asked 2026-11-16, unanswered.)
- Abbreviations beyond penicillin → PCN: any others he uses? (Asked 2026-11-16, unanswered.)

---

# §2 — UNRULED TILES

**AWAITING HIS REVIEW — he names them one at a time.** Each section below records **what the code does today, NOT his rule**. Nothing here is his ruling. Where a want of his is recorded from an earlier list (the 2026-10-29 big issues list, the tile-red rules), it is marked as such and is not a ruling from the review.

## 2.1 ROOM — UNRULED

**What the code does today.** Value: the room-bed from the chart header (the S key's room finder reads the banner; Crown Heights carries an E/W wing prefix, e.g. E404A vs 404A). The tile sits in the band row. No note-transfer target for room is recorded anywhere in the ledger, and no red rule for room exists in the code — the room tile has no fill contract in the record.

**Open questions.**
- Does the room tile need a red rule at all (note vs chart)? Does it need a transfer? What would its note anchor be — or is room display-only by design?
- (No live verdict, no harness, no ruling — he has not named this tile yet.)

## 2.2 WEIGHT — UNRULED

**What the code does today.** Value: from Weights/Vitals. Clicking the weight tile jumps to the WTS/VITALS tab (Master-Key). Weights NEVER landed in the note — stage 2 (per the ledger; the gatherer has no weight fill path). No red rule for weight exists in the code.

**Open questions.**
- Should weight turn red (note vs chart)? Should it transfer, and to what anchor in the note?
- What is the weight tile's source of truth when the vitals page hasn't been visited — is "not loaded" the right display?
- (No live verdict, no ruling — he has not named this tile yet.)

## 2.3 BIMS — UNRULED — BIMS is problem #1

**What the code does today.**

- **Value.** Score + assessment date from the assessments-list Score column, e.g. "10 on 9/21/26" — the ASSESSMENT date, not the lock date. (The date cell's textContent carries a hidden duplicate — " 9/21/20269/21/2026", a display:none span + the visible date — so the date is extracted by unanchored `DATE_RE` exec, not by reading the cell text. A first `txt()`→textContent swap got this wrong — badge read the lock date 10/5/26 — and the exec-extraction fixed it; harness-verified identical OLD vs NEW.)
- **Search-all-forms.** The chain reads every candidate type's list; family = concept words (BIMS | Brief Interview | Mental Status | Cognitive | Social Service | MDS), current then retired; on a miss, a background sweep fetches the rest; points union-merge, newest date wins. Proven by harness h190 (A: current-type list lands 99 on 9/18/2026; B: Bedford's retired V10 lands 6 on 9/7/2026; C: sweep lands the 99 from an unnamed type). **Rig-proven only** — real fetched lists may lack inline Score cells (the 2026-10-19 evidence says fetched lists lacked them); it settles with ONE Page Capture of a chart whose BIMS tile filled on chart open without a list visit.
- **Red rule (code, `tileVerdicts` in verdicts.js).** The note's newest BIMS date on/after the chart's date = never red. A chart stop (0/99) owes a transfer only when NEWER than the note's last score. A stop in the note with no chart score stays exempt. Active monitoring (chart 1+) keeps the **6-month freshness rule**: note latest missing, or older than 6 months, → red. Plus a readmission branch: if not otherwise red but the chart is a readmission and both a current and a previous BIMS exist, the previous BIMS date falling before the window start re-reds it.
- **0/99 (his rules from the 2026-10-23 round, recorded in the ledger — not yet re-confirmed in this review).** 0/99 = he stops testing. A note whose newest score is 0/99 is never red for age (chart stopped too, or chart carries no score). If the chart's newest is 0/99 while the note's newest is still 1+, the tile IS red until a 0/99 transfers into the note.
- **Fill placement (his rule from the ledger, not yet re-confirmed in this review).** A copied BIMS goes after the LAST proper score line. The "- Per SW, BIMS" anchor is ONLY for a new patient with no BIMS properly filled — never on follow-ups.
- **Transfer.** Click the tile or G → the current BIMS is appended below the latest score line. `applyBims` needs a line containing "BIMS". The BIMS tile does NOT write on its own; a queue is a user-action artifact only (tile click / G).
- **Stale date inside H-filled history text.** The history H copies is a snapshot: a note reading "BIMS 15 on 7/14/26" against a tile reading "15 on 9/30/26" is the July note's own text copied verbatim by H — NOT fixed by design. Clicking the BIMS tile after H appends the current BIMS below it.

**His wants from the big issues list (2026-10-29 — recorded wants, NOT review rulings).** No BIMS score at all → reads/transfers "NA." Note has NA → inserting a score REPLACES the NA. BIMS red-date rule restated (whether it is a restatement or a violation is unanswered).

**Open questions.**
- Sweep-always vs sweep-on-miss: the family landing any point short-circuits the sweep, so a renamed type's NEWER BIMS is never fetched — 'most recent' holds only within the family. **His ruling owed** (relayed 2026-10-19, still unanswered).
- Retired BIMS on button 2 at Boro Park: button 2 lands on the retired "SS: BIMS/PHQ-2 to 9 - V 1" with the stale 1/5/2024 score carried through the profile. The 2.22/2.24 correction (never save a retired TYPE; clear retired saved values on sight; correct to the live "N Adv - Brief Interview For Mental Status (BIMS) Evaluation") is NOT live-proven.
- TYPE filter stuck on BIMS: his 2026-11-16 evening report — "getting caught on bims and i have to click on 1 many times before it goes." Probe h273 running (click-during-burst + TYPE-filter reproduce).
- BIMS "NA" behavior (above) — needs his ruling in the review.
- BIMS red-date rule: restatement vs violation — unanswered.

## 2.4 RELATIONSHIPS — UNRULED

**What the code does today.**

- **Value.** Contacts from the Profile contacts table (`parseContacts` → RELS canonicalization; the RELS table gained 8 in-law entries in Core 2.11.14 after the 2026-11-09 incident in which a stale queue auto-wrote "grandson, daughter" over his correct "grandson, daughter-in-law" with nothing pressed).
- **Red rule (code).** Set compare — order does NOT count; missing/extra = red. 'self' is required ONLY when it is the ONLY contact; excused on both sides otherwise; the tile never shows 'self' when other contacts exist. (Recorded in the ledger from the 2026-10-23 round — not yet re-confirmed in this review.)
- **Transfer.** Click the tile or G; needs a "Family/Social Hx" / "Primary contact" line. The relationships queue is written on user action only (tile click / G) since Core 2.11.16 — `feedRowTile` no longer writes it on gather. (The 2026-11-09 unauthorized auto-write is fixed; live proof that doing nothing changes nothing is still owed.)
- **Autowrite guard (code, Copy 1.21–1.22).** A queue applies only when it agrees with the live chart record (≤5 min) or, with no live chart, inside the 30s fresh window; a queue disagreeing with any chart value never lands.

**Open questions.**
- His review of the relationships rules (set compare, 'self' excuse, in-law handling) — he has not named this tile yet.
- Live verdict owed: doing nothing changes nothing (no auto-write) on a new patient.
- The transfer anchors ("Family/Social Hx" / "Primary contact") belong to the blank-form skeleton (§3.7) — unruled.

## 2.5 PSYCH MEDS — UNRULED

**What the code does today.**

- **Value.** From the Orders/meds list via Core's `buildMedList` (header + sig parsing: dose, frequency via `freqOf`, route via `routeOf`, indication via `indicationOf` with MEDLIST defaults). Tile lines read "- Name dosemg FREQ for indication", e.g. "- Luvox 100mg QHS for depression". Psych meds are tiered to the top in the blue box, always expanded.
- **Display limit (known, needs his call).** 4+ psych meds clip in the band tile: the 4th line stays in the DOM but is cut by the 101px cap with NO overflow indicator — only the count chip shows the true total; split-view wrapping clips sooner. The tile is clickable (delegate opens the meds panel), so nothing is unreachable, but it is not visible in the band. Needs his call: accept, or add an overflow line.
- **Red rule (code).** The verdict compares the displayed meds against the note's "Psych meds" section. Psych meds must follow the tile's order (indication groups, seizure/Parkinson's last) — same set in wrong sequence = red. **Still open: whether within-indication-group med order counts — his call.**
- **Transfer.** Click the tile or G; needs a "Psych meds" anchor in Impression. On a pre-H NEW note the Impression field is empty, so there is no anchor — workflow: press H first, then the meds tile / G. Meds reconcile: dose/frequency from chart, HIS indication stays for existing meds, chart indication for new meds, annotation lines untouched, Rivastigmine never "Exelon".
- **Absolute indication rules (his, from the ledger).** NAMENDA RULE (absolute): Namenda (memantine) ALWAYS dementia, never psychosis — even when the order sig says otherwise; extended the same day to the dementia-only class (Aricept, Rivastigmine, Razadyne). FORCED_IND absolutes: Melatonin→sleep; Remeron→depression; benzos→anxiety.
- **Known extraction gaps (code, proven by harness).**
  - **Invega Sustenna (2026-11-16, fixture h272 9 pass / 1 fail).** `buildMedList` drops it: `freqOf` reads "one time only" as ONCE and discards the segment before it becomes a row, and `freqOf` has no pattern for "1x per month" (so it would land in review, not the tile, even without the ONCE phrase). Silent drop: in neither lines nor review. Name/dose/route all fine (Invega matched, 156mg from the sig, IM). His expected line: "- Invega Sustenna 156mg IM for psychosis". **Dropped (his, 2026-11-18): the patch is not in the remake. The lesson stays: a monthly depot must never be silently dropped — the rebuild's med builder handles that shape by design.**
  - **Rivastigmine patch dose (fixed Core 2.11.9, harness h236).** Dose "4.6 MG/24HR" failed both dose paths; fixed with a "MG/24HR" patch-dose pattern + "Apply" in the sig dose regex.
  - **Zoloft stale fill (fixed Core 2.11.12, harness h241).** Verdict and click used stale `d.medsFill` ("- none") while the tile displayed live `d.meds`. Fix: in `buildCards`, if displayed meds are real but fill is none/missing, fill takes the displayed value (one-directional). **The deeper WHY of medsFill staleness is NOT answered.**
  - **Zyprexa indication mining (fixed 2.10.14, harness h187).** `indicationOf` mined the sig tail "for RESIDENT" as the indication. Guard: resident/patient boilerplate falls back to the drug's MEDLIST default (Zyprexa → psychosis); real stated indications still win.
- **His wants from the big issues list (2026-10-29 — recorded wants, NOT review rulings).** Zyprexa multiple sigs on one line. Ativan BOTH lines (QD + q12h PRN). Auvelity must be in the psych meds list. NO medications at all → psych meds reads "none." (Screenshots owed for the first three.)

**Open questions.**
- Invega: DROPPED (his, 2026-11-18) — the patch is not in the remake; the lesson (monthly depot must never silently drop) stays for the med-builder spec.
- Within-indication-group med order: counts or not? (His call.)
- 4+ meds clip: accept, or add an overflow line? (His call.)
- Zyprexa multi-sig, Ativan both lines, Auvelity, "none" when no meds — needs his ruling in the review (screenshots owed).
- The deeper WHY of medsFill staleness.

## 2.6 DIAGNOSES — UNRULED

**What the code does today.**

- **Value.** From `#pnDxBox` ONLY (Pipe 12 gap — diagnoses land only from that box; the Progress Notes View All scrolled to his note is the unsettled capture). The Core Diagnoses tile carries NO fill contract — the queue write is the Extractors box's; Core copies only (debug-verified: data-fill-label null, stamp intact).
- **Red rule (code).** A `dx` verdict exists in `tileVerdicts`; the exact compare semantics are not recorded in the ledger — verify from verdicts.js before ruling. Do not assume it matches the meds/relationships set compares.
- **Transfer.** Click the tile or G; needs BOTH "Medical Hx" AND "Family/Social Hx" lines — if either is missing, nothing lands. Follow-up: the diagnoses block between Medical Hx and Family/Social Hx is replaced wholesale. (Diagnoses never queued at all before Core 2.11.15 — `queueCopy`'s label map had NO "Diagnoses" entry since the 2.10.0 baseline; fixed with harness h259 25/25.)
- **Extractor rules (his, from the ledger — the diagnoses-from-notes extractor, not the tile).** No "Past Surgical History"/"hx"; strip "reviewed in electronic medical record" and "reviewed in chart"; strip the "Primary admitting diagnosis:" label; tests/procedures are not diagnoses; abbreviations always applied incl. inside verbatim lines (HTN/HLD/OA); Seizures ≡ Seizure disorder deduped; ICD qualifier fragments and stray template brackets dropped.

**Open questions.**
- His review of the diagnoses tile rules (red rule, transfer anchors, ordering) — he has not named this tile yet.
- Diagnoses not copying at Saints (big issues list item 1) — open.
- Pipe 12 gap: diagnoses land ONLY from `#pnDxBox` — needs the View All capture scrolled to his note.
- The "Medical Hx" + "Family/Social Hx" dual-anchor requirement belongs to the blank-form skeleton (§3.7) — unruled.

---

# §3 — SHARED MACHINERY

One page. This is what the code does today; the design decisions are open (§4). The PACKET-CONTRACT.md (identity + packet contract, step 2 of the earlier rebuild design) already states five rules — one identity, every fact stamped, freshness and replacement, settle then render, event-driven movement — and this section records how far the current code is from them.

## 3.1 Identity — which patient is this

Three formats exist in the code today, and the 2026-11-16 transfer work proved they do not compare equal without care:

- **Chart number** — `chart:BC…` (queue stamp, from Core's `residentKey` reading the chart number from the resident header) and the digits-only `tmTileChart.key` (e.g. `"1802714"` — `chartNumMatch()` returns `__tmCore.chartDigits()` or a `(\d{3,})` capture). Comparisons must use digit tails (`digitsOf`/`sameChartKey`), not string equality — Ear 1 proved the naive comparison can never fire.
- **EID** — `eid:EID_…` (the form URL's `ESOLclientid` token). Rotates per page/link and can never equal a chart number. It is also what a form document's own `__tmGather.key()` returns live (proven end-to-end with the real Core dist in the real TREE-0616 capture) — it is NOT null in a follow-up form, and it must never shadow the stable client PK (Ear 2).
- **Client PK** — `cid:<digits>` (the stable numeric client PK; form side: hidden `#assessClientId` = 57595524, hidden ESOLclientid inputs, `const GLOBAL_CLIENT_ID = "57595524"` in TREE-0616; chart side: PCC's `getCurrentClientIdNumber()`, "X" in redacted captures). Core 2.11.19 records it as `tmTileChart.clientId` via `chartClientId()` (`getCurrentClientIdNumber()` → `/^\d+$/`, else `GLOBAL_CLIENT_ID` → `/^\d+$/`, else null; memoized per load).

**Resolution order today (Copy 1.28 `hereKey()`).** Local `chart:` → opener `chart:` → `formClientId()` (`cid:`) → form-URL EID → remembered `eid:` → null. An `eid:` result can no longer shadow `cid:` (Ear 2 repair). **NEW-form popups** open via `pccPopup` (`launchNewAssessment()`), so NEW-form docs DO have `window.opener` = the chart page; follow-up forms open by same-tab navigation (`checkForLockPriorToView` does `window.location = href`), so there is no opener.

**Live unknowns (unproven — only his live test settles them).**
- Chart-page `getCurrentClientIdNumber()` vs form `assessClientId` match. If they don't match, `cidProof` never fires and follow-up transfers stay refused — safely, never wrongly. NEW-form popups don't depend on it (opener path).
- EID token uniqueness across patients is NOT capture-proven (residual risk for `sameDocProof`, bounded by the value check + clock rules; `sameDocProof` is narrower than 1.27, which landed a same-token eid: queue on token equality alone).

**Open design decision.** The full patient-context-authority proposal (2026-11-04): (1) single patient ID function (chart number or null; patient-dependent features refuse when null); (2) patient-stamped everything; (3) verdict invalidation on patient change; (4) event-driven not poll-driven; (5) H patient check. Narrow forms shipped in Copy 1.25 + CNR/Saints 1.60 and now Copy 1.28's `cidProof`/`sameDocProof`. **The full proposal still awaits his decision.**

## 3.2 Verdicts — who decides red

**Core's `verdicts.js` is the SINGLE VERDICT PUBLISHER** — the only writer of `tmTileWarn` (Copy to note stopped writing/clearing it in 1.17, after the flicker war proved two publishers overwriting each other on their own cadences). `tileVerdicts(txt, medsTxt, chart)` returns {age, allergies, meds, rel, bims, dx}. Future verdict rules go in Core's verdicts.js ONLY.

**Open design decision.** The verdict engine recomputes on gathers/clicks today; the PACKET-CONTRACT's Rule 4 (settle, then render — tiles and verdicts compute once from the settled packet for this page load) is the rebuild target. The per-tile red rules live in §1–§2; the engine's scheduling lives here.

## 3.3 Queue — how a transfer travels

- **A queue is a user-action artifact only.** `queueCopy` (tile click / G) is the sole writer of `pccFill*` keys (since Core 2.11.16); `queueCopy` dispatches a `tm-queue-written` event in its own document. A queue carries {value, ts, resident}. Topics: Diagnoses, Bims, AgeSex, Allergies, PsychMeds, Relationships.
- **Read rules (Copy 1.28 `readQueue`).** Wrong-patient refusal fires ONLY on a same-format mismatch. `cidProof` = here is `cid:` AND chart.clientId matches AND the queue is chart:-stamped AND chartKey matches the queue stamp (digit tails) → samePatient. `sameDocProof` = queue resident is `eid:` AND this doc's own `key()` is itself `eid:` AND the token exactly equals this form's URL EID → samePatient. Cross-format without proof refuses (same as here-null). `here` null → refuse. Downstream clock rules: a queue matching a live (≤5 min) chart value lands at any queue age; same-patient queue with no chart value → 30-min window; a queue disagreeing with any chart value never lands.
- **G is RED-ONLY.** G clicks only red tiles' Copy carriers; no valid verdict = G queues nothing. Gates: `tmTileChart` fresh ≤45s + key-matched, verdict ≤120s, `tmNoteOpen` ≤75s.
- **G-in-form WRITE is dead live in a headerless follow-up form** (proven by Ear 4, pre-existing, independent of `readQueue`): Core's `g` handler fires (`tmGPress` written) but writes NO queue (`queueHiddenTileFills` iterates an empty `__tileReg` — `plantBand()` returns early, no `#residentHeaderButtons`); Grab-all (standalone + Extractors module) clicks `.pcc-fill-copy` — ZERO in the real form DOM. TREE-0616: 0 residentHeaderButtons, 0 `.pcc-fill-copy`, 0 tm-tile, 0 frames. So "G in the form" was never live-proven under ANY version — 1.24's "G in the form applies immediately" has no live verdict in the record. **The drop fixes the ACCEPTANCE, not the WRITING.** Whether a real NEW-form popup has a header is unproven (no NEW-form capture) — the popup G-write path is open, the follow-up G-write path is proven dead. **Open: needs a separate build (a g handler that queues from `tmTileChart` without tiles) or a scope correction declaring Dashboard-click the supported G flow.**
- **Note heartbeat.** `tmNoteOpen` + 15s chain while the note field exists; only the publishing document clears it. **Copy is the SOLE writer to note fields** (Core never writes textarea values).
- **Gate.** `looksLikeHisNote`: a note must carry ≥2 of {HPI, Medical Hx, Psych meds, Allergies, Primary contact, BIMS} or nothing applies. `findNoteField`: label match ("1. Psychiatry Consult" / "Psychiatry Consult" / "HPI /") then the first following textarea; fallback = largest textarea (>100×50); miss cached 2s per URL (Copy 1.26).

## 3.4 Scheduler — when work runs

**What the code does today.** Seven scripts run their own timers/bursts: Core ladders [0, 600, 1500, 3000] + gather on every click + publish on click/keydown (cached JSON, re-stringify only when dirty; keydown publish throttled 1/s); Copy load timers [800, 2000, 4000, 8000, 15000] + storage listener (coalescer) + 15s heartbeat; Readmission flag burst 250ms × 28 (~7s); Extractors relBurst/badgeBurst + Psych Orders burst; Hide-tabs swap bursts (capped 8); Grab-all badge bursts. Bursts re-arm on clicks. Storage events cascade between scripts (one publish → every other script's storage listener fires → re-read, re-render, sometimes re-publish).

**Measured (real browser, 2026-11-16, current files — his installed versions unconfirmed).** Settled clicks are fine (320–345ms, 0 layout reads). Load cost is diffuse, ~1.0–1.7s of longtasks spread over ~7s after every chart open (Core ladder ~299ms, Extractors Psych Orders burst ~216ms — resurrected by the 1.1.4 TDZ fix — Flag 1.15 update ~182ms, max 121ms/call, Copy timers ~82ms, ~320ms initial Core gather). AssessList regressed modestly vs speed round 5 (TTI 2649→3006/3656ms); Dash/Profile unchanged. **No single hot spot — no switch to flip for relief.** The rigs cannot reproduce his fluctuating symptom (fast, then frozen, then fast; clicks needing many tries); the mechanism that fits is clicks landing *inside* the ~7s burst window, each firing Core's gather + publish + tile re-render while the ladder, Orders burst, flag burst, and Copy timers are already ticking. Probes running: clicks at load+1s/+3s inside the burst window (h273).

**Open design decision (APPROVED direction, detail open).** One shared scheduler: all periodic work runs on one coalesced tick, never overlapping; no script runs its own burst; nothing re-arms on a click; verdicts refresh once after things settle, not during; tiles never re-plant under his cursor (render once, update text in place; clicks handled by a stable parent so a re-render can't eat them); one publish, not a cascade (dirty-flag, storage listeners ignore their own writes and coalesce); a real-browser speed budget as the ship gate. The PACKET-CONTRACT's Rule 5 (event-driven only — no timers, no pollers, no observers, no heartbeats; the bounded one-shot passes stay the only scheduled motion) is the constitution.

## 3.5 One-submit authority — the TYPE-filter race (spec-level finding)

**Proven (real browser, 2026-11-16).** Pages 1.2.2's View-All tick submits the form **150ms after any SELECT change with NO pref-save**; PCC's pref-save is async (TYPE select onchange: `submitRefresh` → `setUDATypeSetting` → `$.getJSON('/common/ajaxcontroller.xhtml', {set_user_pref, userUDATypePreference})` → callback → `form.submit()`; Apply is the status/date path and navigates WITHOUT writing the preference). Any round-trip slower than ~150ms loses: the reload renders the old BIMS pref, and the adopt rule erases the sticky. Threshold bracketed (100ms wins, 300ms loses). The same race explains retired BIMS reappearing (correction fires, tick beats its save, reload renders the retired pref again). Clicks get swallowed two ways: the page navigates underneath, and the tick-submit discards the change.

**Current code rules (BP Keys 2.24, harness h250 33/33).** NO Apply click after a TYPE change — the select's own onchange IS the navigation. MD is NOT a default — restore ONLY at the first option ("All"). Stability gate instead of a fixed-time ladder — poll every 250ms (bounded ~3s), act once, only when the select snapshot is unchanged across three consecutive polls (500ms stability). Never save a retired TYPE; clear retired saved values on sight; correct a retired BIMS to the live "N Adv - Brief Interview For Mental Status (BIMS) Evaluation".

**Rig artifact.** TREE-1959 carries fossil inert number badges (listeners don't serialize) — BP Keys' don't-double-add guard sees them and skips planting live badges; strip fossils in served HTML.

**Open design decision.** The rebuild needs ONE submit authority: a single owner for form submission on the assessments list, so no tick and no pref-save can race each other. The TYPE-filter-stuck-on-BIMS report (2026-11-16 evening) is the live shape of this race; probe h273 is reproducing it.

## 3.6 Flash / red display

- Tile red = `tmTileWarn` from Core (single publisher, §3.2). A tile's red state must disappear promptly after the information is placed in the note (big issues list item 10 — the timing is not specified in the code; open).
- Copy confirmation: the tile label flashes "Copied"; S copies show a yellow badge; G shows a fading badge naming what was queued.
- Smooth Arrival (§0): tiles present ONCE at exactly the size needed to view all their content — never start-small-then-expand, never grow/shrink on screen. Progressive DATA arrival is fine; progressive LAYOUT is not. Band tiles are born frozen at fixed-by-kind widths (166/88/82/300/86/176/196) and ONE uniform height 72px.

## 3.7 H (history fill) and the blank-form skeleton

- **H (CNR/Saints Keys).** Follow-up forms only. HPI (PCC question key `Cust_2_I_2`) + MSE (`Cust_2_II_1`) + Impression (`Cust_2_II_5`) from the history popup (`questioncompare.jsp`), most recent entry. On a NEW note H has nothing to fill (his "lol. never mind" — expected behavior). `normalizeHpiHeader()` rewrites the "HPI xx" header from `tmTileChart.ageSex` after H fills, ONLY when the chart is proven to be this patient's. History is a snapshot (see §2.3 on the stale BIMS date). The history popup encoding is Windows-1252.
- **Blank-form skeleton (DISCUSSED, NOT BUILT).** His thought (2026-11-16): "what my blank form should look like so that the blanks that need to be filled out will easily be picked up by the copier." Mica's proposal (his decision PENDING): the blank form pre-places all six anchors as empty lines so the copier fills blanks instead of inventing structure. Anchors the copier needs: Age/Sex → "HPI" line; Diagnoses → BOTH "Medical Hx" AND "Family/Social Hx" lines (hard edge: if either is missing, nothing lands); BIMS → a line containing "BIMS"; Psych meds → "Psych meds" anchor in Impression; Allergies → "Allergies:" line; Relationships → "Family/Social Hx" / "Primary contact". Confirmed anchor shapes so far: "HPI xx", "Allergies: xx". Gate: Copy refuses a note with fewer than 2 of those 6 anchors (`looksLikeHisNote`). Mica recommended **H** plants the empty skeleton (on a new patient with no history; keeps the keypress law) over planting on form-open (writes without a keypress). He redirected back to age/sex before ruling — **the blank-form decision is still open**.

## 3.8 Keys, tabs, and navigation (summary — see PCC-Master-Key.md for the full record)

- Keys: `0` = kill switch (every script); A = resident search; F = context action (Save / Lock / edit / copy / View All — per page, per facility); Escape = blur while typing; F14 = typing-exempt Save; 1/2/3 = TYPE filter shortcuts on the assessments list (1 = psych, 2 = BIMS, 3 = MD review — **Boro Park ONLY**). Q is RESERVED for the Q-walk (do not map). All keys dead while typing, no repeat on hold.
- Hide-tabs: 18 known tabs; hides the ones he never opens; FROZEN BAR with swap-burst exception (capped 8); last-tab memory (1.28): `tmLastTab` in localStorage, save on click + tabKeyGo, restore ONCE on a fresh chart open that lands on ORDERS. Tab shortcuts H/P/O/N + F13 (assessments tab by href). Helium split view = Option+Cmd+click; Option+Cmd+Enter on an F13-focused link opens split view. Final ducky macro (key 12): `F13 / DELAY 400 / OPTION COMMAND ENTER`.
- Charts open on Orders by default; the last-tab memory is supposed to restore the tab he left open (live verdict owed).

---

# §4 — SCOPE

**v1 scope is an OPEN QUESTION for him. This section does not decide it.** The rebuild was approved 2026-11-16 ("Yes, rebuild it properly") with the direction from §3.4 (one scheduler, no work on click, tiles never re-plant, one publish, real-browser budget) and the PACKET-CONTRACT's five rules. What v1 contains is his call.

## 4.1 Candidate v1 scope (for his ruling)

- The 9 tiles (§1–§2) with their ruled-or-to-be-ruled red rules and transfer rules, on the single architecture.
- Transfers (Dashboard-click + G) through the 1.28 machinery (cidProof / sameDocProof / digit tails), with the G-in-form write question settled (§3.3).
- Speed: the §3.4 scheduler + one-submit authority (§3.5), gated by a real-browser budget.
- The in-flight fixes, finished first: transfer drop (Core 2.11.19 + Copy 1.28, Ear 4 PASS), Invega Sustenna fix (DROPPED 2026-11-18 — not in the remake), TYPE-filter / BIMS-stuck probes (h273 running).

## 4.2 Parked list (from the ledger — do not build without his go)

- More navigation buttons (his idea, 2026-11-10) — parked until the BIMS work is done; button set unspecified.
- Floating patient panel (mocked 2026-11-04, NOT built, NOT approved) — separate floating panel, two views (Follow-up / New Patient), click panel = refresh. Mockup: `~/workspace/pcc-scripts/patient-panel-mockup.html`. His decision: PENDING.
- Fuzzysort 4.0.2 + brand→generic synonym map (shelf §2.5; POC 15/23 pass — all 7 brand→generic fail without the map) and vitest happy-dom for the harness (shelf §2.6; POC 7/7). Approved as TODOs 2026-11-10, neither started.
- Patient-context-authority full proposal (§3.1) — awaits his decision.
- Search refine box (client-side live filter on the search results page) — go-ahead asked 2026-11-16, answer not given.
- Sweep ruling: sweep-always vs sweep-on-miss (§2.3).
- Dash gap A/B/C ruling; slate second-tier repaint; Misc dim pick; GDR source page; psych-history/substance-use page; dietary/medical-notes-in-Prog-Notes confirmation.
- Top 5 Recommendations tile (tiers: safety > regulatory > monitoring > trajectory; library + tiers + label still to be ruled).
- Ollama design (local LLM as thesaurus, never reader — no decision made).
- Shortcut tooltips (visual session, undecided).
- H `ensureHistButtons` duplication (dead large-H-button code — changing button behavior needs his say-so).
- Dot (installed 1.2, DISABLED — he does NOT use Dot; never include Dot in a fix list). Q-walk (designed, not built). Ring output (defined, not built).

## 4.3 What the rebuild must prove before it ships

- Every ruled tile passes fixtures built from its own reporting captures, in the faithful test environment (§0, senior-dev step 3) — not jsdom alone.
- The harness covers the live shape of EVERY flow a drop touches (the lesson of Ear 2 and Ear 3: h271 seeded `gatherKey=null`, a state that never occurs live; h262's synthetic form had no `#assessClientId`, so G-in-form passed while live it refused).
- Ear (independent, did-not-build) gates every drop; Rest (privacy, VETO) gates anything touching storage/network/patient content.
- His live verdict remains the acceptance test — but it stops being the test suite: tests prove it works, he proves he likes it.

---

# §5 — OPEN QUESTIONS THAT NEED HIM

Consolidated. Each item names what it needs from him (ruling / live test / capture).

**Rules (need his ruling, one tile at a time in the review).**
1. Allergies: Bedford — exception or not? (Asked 2026-11-16.)
2. Allergies: abbreviations beyond penicillin → PCN — any others he uses? (Asked 2026-11-16.)
3. BIMS: sweep-always vs sweep-on-miss. (Owed since 2026-10-19.)
4. BIMS: "NA" when no score at all; inserting a score REPLACES the NA. (Big issues list.)
5. BIMS: red-date rule — restatement vs violation. (Unanswered.)
6. Psych meds: Invega — DROPPED (his, 2026-11-18). The patch is not in the remake; the lesson (monthly depot must never silently drop) stays for the med-builder spec.
7. Psych meds: within-indication-group order — counts or not? (His call.)
8. Psych meds: 4+ meds clip — accept, or add an overflow line? (His call.)
9. Psych meds: Zyprexa multi-sig, Ativan both lines, Auvelity, "none" when no meds. (Screenshots owed.)
10. Room, Weight, Relationships, Diagnoses: their red rules and transfer rules, as he names each tile.
11. Blank-form skeleton: does H plant the six anchors on a new patient? (Decision pending since 2026-11-16.)
12. v1 scope (§4.1): what is in, what stays parked. (His call.)
13. G-in-form write: separate build (a g handler that queues from `tmTileChart` without tiles) or a scope correction declaring Dashboard-click the supported G flow? (§3.3.)
14. Patient-context-authority full proposal: adopt or keep the narrow forms? (§3.1.)
15. Dash gap A/B/C; Misc dim pick; slate second-tier repaint. (Rulings owed.)
16. Top 5 Recommendations tile: framing, library, tiers, label. (To be ruled.)

**Live tests (need his verdict — he is the only acceptance test).**
17. Transfer drop: Dashboard-click a tile, open the follow-up form, value lands; do-nothing = note unchanged. (Ear 4 PASS; install state of 2.11.19/1.28 unconfirmed at draft time.)
18. NEW ADMISSION chip at CNR/Saints for a real new patient.
19. Age tile red on a wrong-letter HPI live + tile/G fixing it live.
20. Retired BIMS: button 2 at Boro Park no longer lands on the retired form.
21. Doing nothing changes nothing (no relationships auto-write) on a new patient.
22. Speed: page visuals instant; settled clicks snappy; the fluctuating fast/frozen pattern gone.
23. Hide-tabs 1.28 last-tab memory; Copy 1.26 search typing; Extractors 1.1.4 G/Grab-all module; CNR/Saints 1.60 header-normalize; Vitals 1.6. (Accumulated live verdicts owed — see PIPE-LEDGER.)

**Captures (need him to send, or a Page Capture to settle).**
24. A CNR/Saints assessments-list capture — RECEIVED 2026-11-19 (pcc-v2-capture-0807.html). It does NOT settle the Score-1.0 question (it has no "In Progress" row). Settled instead by his live screenshot the same day: the open consult is Status "In Progress" + Score "1.0". (The facility name-scan live is still unproven — the capture's facility name is redacted.)
25. ONE Page Capture of a chart whose BIMS tile filled on chart open without a list visit (settles search-all-forms live).
26. A NEW-form popup capture (settles whether a real NEW-form popup has a header — the popup G-write path).
27. Med/behavior screenshots for the big-issues items (Zyprexa multi-sig, Ativan both lines, Auvelity).
28. Filled Discharge Date; BIMS wrong-placement; Pipe 12 (Prog Notes View All scrolled to HIS note); SELF resident's Dash; Results capture.

**Live unknowns (no ruling can settle these — only a live test or a capture).**
29. Chart-page `getCurrentClientIdNumber()` vs form `assessClientId` match (§3.1).
30. EID token uniqueness across patients (§3.1, §3.3).

---

# Sources

- Tile-by-tile review, 2026-11-16 (re-entry, age/sex, allergies ruled): PIPE-LEDGER §2026-11-16 tile review; harness h270 (23/23); Ear PASS 2026-11-16 17:12.
- Transfer mechanism, 2026-11-16: PIPE-LEDGER §2026-11-16 transfer; harnesses h271 (21/21), h272-live-shape-e2e (8/8), h263 (22/22), h262 (31 checks — the repair's G6/G7/G9 deterministic; E1–E3 flaky by timing, documented in the ledger; C4 passing), h270 (23/23); Ear 4 PASS 2026-11-16 ~18:46.
- Invega Sustenna: fixture h272-invega-sustenna.js (9 pass / 1 fail on current code); screenshot `~/workspace/user/media_library/image/Screenshot_2026-11-16_at_5.39.43_PM.png`.
- Speed rounds 4–5 + lag profile: rigs h266-realbrowser / h268-load; probe h273 (running).
- TYPE-filter race: probe finding 2026-11-16 (150ms tick vs async pref-save; 100ms wins / 300ms loses); BP Keys 2.24, harness h250 (33/33).
- BIMS search-all-forms: Core 2.10.16, harness h190; sweep ruling owed since 2026-10-19.
- Standing laws and history: `~/AGENTS.md` (PCC charter, fast lane, Smooth Arrival), `~/MEMORY.md` (PCC sections), `~/workspace/goals/pcc-tampermonkey-scripts/GOAL.md`, `files/PIPE-LEDGER.md`, `files/PCC-Master-Key.md`, `files/PACKET-CONTRACT.md`.
