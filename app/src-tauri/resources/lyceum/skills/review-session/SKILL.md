---
name: review-session
description: Run a spaced-repetition review session over due items from the learner's course. Use when the user says 'review', 'quiz me', 'refresh me', 'what's due', wants daily practice, or whenever review items are due. Keep it short and retrieval-based.
---

# review-session

Runs a short spaced-retrieval session over the due items in the learner's `reviewQueue` and updates their Leitner schedule. It is the long-term-retention lever in the chain — orthogonal to the teach → assign → assess loop, runnable any time items come due. With `assess-understanding`, it is one of the two permitted writers of mastery.

## Read first

Before doing anything else, read these reference files so you act on the shared rules:

1. `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract: the `manifest.json` schema, the read-first/write-last and single-writer rules, the Leitner `due` math, id allocation, and the `progress.md` format.
2. `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the pedagogy: retrieval-before-reveal, spacing, interleaving, calibration, and the exact Leitner ladder and box transitions.

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists (no `learning/<slug>/` folder, or the file is missing/unreadable), STOP and tell the user to run `lyceum:learn` to set up the course first. Do not invent state.

## Process

1. **Resolve "today."** Establish the current date (the session date). Compare `due` values against it as ISO dates.
2. **Select the due batch.** From `reviewQueue`, take every item with `due <= today` whose `box` is not `"retired"`. Cap the batch to roughly what fits `settings.sessionLengthMin` — about 8–15 items. If more are due, keep the ones with the earliest `due` (most overdue) first, but do NOT then sort the chosen batch by topic.
3. **Interleave, do not block by topic.** The due items span modules. Present them in a mixed order so consecutive items rarely share a `moduleId`; never group all of one module together. Interleaving is the point (REFERENCE.md, principle 3).
4. **If nothing is due,** tell the user there are no reviews due today, report the date of the next upcoming `due` item if any, and stop without writing mastery or schedule changes. (You may still bump `updated` only if you choose to log the empty check; otherwise leave the manifest untouched.)
5. **Run each item as retrieval-before-reveal.** For each item in turn:
   a. Show only the `prompt`. Do NOT show the `answer` or any answer-key yet.
   b. Optionally ask the learner for a quick confidence rating (e.g. correct/incorrect, or 1–5) to seed calibration.
   c. Require the learner to generate their recall answer first. Wait for it.
   d. Only then reveal the stored `answer`.
   e. Judge **pass** or **fail** from the learner's recalled answer versus the stored answer — a pass means they genuinely retrieved the core idea, not merely recognized it once revealed. Keep it brief and retrieval-based; this is a quiz, not a lesson.
6. **Apply the Leitner transition** to each item (per REFERENCE.md):
   - **Pass:** set `box = min(box + 1, 6)`. A pass on a Box-6 item sets `box = "retired"` (it stops recycling). Recompute `due = today + interval(newBox)` using the ladder (1d / 3d / 7d / 16d / 35d / 90d). Set `lastResult = "pass"`.
   - **Fail:** set `box = 1`, `due = tomorrow`, increment `lapses`, set `lastResult = "fail"`. Note the item's `moduleId`/concept as a candidate for re-teaching (surface it in the closing summary and in `history`), so the learner knows the loop may revisit it.
7. **Update calibration.** For every item where the learner gave a prediction/confidence, append to `calibration.log` a `{ date, predicted, actual }` entry, increment `calibration.predictions`, and increment `calibration.hits` when predicted matched actual.
8. **Apply lapse penalties to mastery (permitted writer).** For each **failed** item that links to a module objective, you may lower that `objective.mastery` **slightly** (a small decrement, e.g. ~0.03–0.05, floored at 0.0) to reflect the lapse, and update its `lastAssessed` to today. Keep penalties small — a single lapse is a signal, not a reset. Do NOT raise mastery here, and do NOT change any `module.status` or `current.status`/level on the basis of reviews alone.
9. **Close the session.** Give a short retrieval-focused summary: how many passed/failed, which concepts lapsed and may be re-taught, and the calibration tally. Do not turn it into a re-lesson.

## State writes

Write all changes back to `learning/<slug>/manifest.json`, then bump `updated` to today:

- **`reviewQueue[]`** — for each reviewed item, the updated `box`, `due`, `lastResult`, and (on fail) incremented `lapses`. This schedule update is the primary output.
- **`calibration`** — incremented `predictions`/`hits` and appended `log` entries for items the learner predicted.
- **`objective.mastery`** (and that objective's `lastAssessed`) — small downward adjustment only, for objectives linked to **failed** items. This skill is a permitted mastery writer; never raise mastery and never touch module/level status here.
- **`history`** — append one entry, e.g. `{ date, skill: "review-session", event: "reviewed N due items", result: "<P passed, F failed; lapsed: concepts>" }`.
- Append a short human-readable entry to **`reviews.md`** (date, items reviewed, pass/fail counts, lapsed concepts) — the queue itself stays in the manifest.
- Rewrite **`progress.md`** in the exact format defined in MANIFEST.md (reading mastery numbers from the manifest, never inventing them), refreshing the reviews-due line and the calibration tally.

## Guardrails

- **Retrieval before reveal, always.** Never show an item's `answer` or any answer-key before the learner has generated their own recall. This is the core rule (REFERENCE.md, principle 1).
- **Keep it interleaved.** Never sort or group the due batch by topic/module; mix items so the learner must choose the method.
- **Keep it short.** Respect `sessionLengthMin` (~8–15 items). A review is a quiz, not a teaching session — do not deliver lessons; flag lapsed concepts for the teach/assign loop instead.
- **Mastery is nearly read-only.** As a permitted writer you may apply only small downward lapse penalties to linked `objective.mastery`. Never raise mastery, and never write `module.status`, `current.status`, or level transitions — those belong to `assess-understanding` and the mastery gate.
- **Leitner exactly.** Any miss resets to Box 1 (due tomorrow) and increments `lapses`; a pass promotes one box; a Box-6 pass retires the item. Use the ladder intervals verbatim from REFERENCE.md.
- **Never reuse an id.** If you ever add a review item, allocate it as (max existing numeric suffix) + 1.
- **State, not conversation.** Read the manifest first, act, write it last with a bumped `updated`. Assume no other skill ran this session.
