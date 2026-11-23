# PCC v1 — the frozen scope

One page. Ruled by adrian, 2026-11-17–18. This is what v1 must do — and what it must not.

## The floor — what v1 must do

1. **The Dash works well.** Psych meds tiered to the top and opened, same for psych diagnoses. All meds and all diagnoses visible.
2. **The med extractor.** Psych meds read off the Orders list, in note language. Split orders consolidate into one line with the total dose.
3. **All diagnoses on the Progress Notes page.** Diagnoses as full names, no ICD-10 codes.
4. **The two tiles.** Psych meds and diagnoses — the only tile surfaces in v1.
5. **The shortcuts.** A, S, D, F, H, plus the 4 tab shortcuts (H, P, O, N). (1 and 2 removed for now — see Strip.)
6. **The popups.** Admission, follow-up, other, dates, and all the information already in the forms.
7. **The ordering.** On the assessments list, for new patients and when on All: psych consults first, then BIMS consults, then everything else.
8. **The F badges.** All of them, in the right spots.
9. **Copy only.** No transfer. He copies the value, he pastes it into the note himself (the S-button pattern, already proven live). Nothing writes to his note except his own paste.
10. **Fast and reliable.** One gather, one scheduler, one publish. His budget (ruled 2026-11-18): navigation feels instant; getting information takes 0.5 seconds. No silent drops — anything the tile cannot parse goes on a visible review list, never disappears.

## Strip — out of v1

- The other tiles as surfaces: age/sex, allergies, relationships, room, weight, re-entry flag. The data stays in the Brain for v2.
- The BIMS tile (ruled 2026-11-18 — data stays in the Brain).
- The readmission flags (ruled 2026-11-18 — the red box and the verdict chips go). But when he creates a new note, it still loads appropriately: the right Type and defaults. The classification is still computed in the Brain; only the surface is gone.
- The behavior tile in Progress Notes. Dot. G. The Vitals/weight script.
- Hide-tabs' hiding — unhide is fine, as long as the buttons stay where they are.
- Buttons 1 and 2 (the TYPE badges) — removed for now.
- The sticky TYPE machinery — not rebuilt. PCC remembers the TYPE filter on its own; it only stopped when our scripts broke it. The rule is: our scripts never submit the form.
- The transfer feature, from all tiles. The queue, Copy-to-note's appliers, and G go with it.
- The floating panel, Q-walk, the search refine box, more navigation buttons.
- The summary page — parked for v2. The note assistant — v2. The recommendations — v2.
- The BIMS-and-psych combined view (the Forms list showing both BIMS and psych consults, nothing else) — v2 (ruled 2026-11-23). PCC cannot do it natively; it would load "All" and hide the rest, inheriting the "All" load cost.
- The 3 (MD) badge, the verify tile, and the speed budget — out of the frozen scope, back in the full build (v2). The condition: they must always work and never fight him.

## Frozen — 2026-11-18

The scope is frozen. The 3 badge and the verify tile are out of v1 and back in the full build (v2) — on the condition that they always work and never fight him. The speed budget numbers are ruled: navigation instant, information 0.5 seconds (the formal gate is in the full build).

## The shape

Three scripts. The Brain (reads PCC and decides), The Hand (writes to the note only on his keypress — H fill and copy, no queue), The Keys (every keybinding, tab, badge, and sticky filter — one settings table per facility). The CSS folds into the Brain.

## The laws

Nothing acts without his keypress. Keys dead while typing. 0 is the kill switch. Nothing fights him — the system never overrides, undoes, or works against what he chose. Nothing changes except for the change he requests. Privacy, accuracy, speed, intuitive, beautiful — in that order. No silent drops. His live verdict is the acceptance test.

## The gate

No code until the spec is done, the rig covers every v1 flow, and the design is written. The old system stays his working tool in maintenance mode until v1 passes the rig and his live test.
