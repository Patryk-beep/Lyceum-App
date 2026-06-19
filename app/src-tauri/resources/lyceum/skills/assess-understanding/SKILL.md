---
name: assess-understanding
description: Assess and grade a learner's submitted assignment or answer, give feedback, and update their progress. Use when the user submits work, asks 'how did I do', 'check/grade my answer', 'is this right', or whenever an assignment has a submission waiting. Tracks mastery per objective and decides whether to advance or remediate.
---

# assess-understanding

Grade a submission, give feedback that teaches, update mastery, schedule reviews, and decide whether to advance or remediate. With `review-session`, this is the ONLY skill that writes mastery scores and module/level status. It sits at the end of the per-module loop: `teach-lesson` → `create-assignment` → **assess-understanding** → (advance or remediate).

## Read first

Before doing anything, read these reference files (they carry the rules this skill enforces):

1. `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, the schema, the single-writer rule, the `progress.md` format.
2. `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten principles; especially feedback (9), calibration (8), mastery gating (10), and the productive-failure consolidation rule.
3. `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale, the per-level mastery thresholds, and the band→mastery mapping.
4. `${CLAUDE_PLUGIN_ROOT}/references/ASSIGNMENTS.md` — the single-point analytic rubric and the productive-failure two-phase contract.

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists (or it is unreadable), STOP and tell the user to run `lyceum:learn` first — do not invent state.

## Process

1. **Locate the submission.** Find the `assignments[]` entry being graded — usually the one with `status:"submitted"`, or, if the learner just pasted an answer conversationally against an `open` assignment, the matching entry. If that entry is not yet `submitted`, flip it to `status:"submitted"` now, then grade. Read the brief, the rubric, and any held answer key from the assignment's `file` path. **For the learner's actual submission: if the entry carries a `submissionFile` (the Lyceum app writes the hand-in there, e.g. `submissions/a02.md`), read THAT file — it is the authoritative answer. Otherwise fall back to the inline SUBMISSION PLACEHOLDER in the brief.** When the entry's `inputType` is `"choice"`, the submission is the chosen option text — grade it against the held answer key.

2. **Identify the targeted objectives.** From the entry's `objectives[]`, load each targeted objective from its module so you grade against the right standard. Note the module's `level` and `masteryThreshold`.

3. **Verify (internal, not shown raw).** Judge the work as **correct / partial / incorrect**, and name the SPECIFIC error or missing idea — the actual misconception or the exact step that broke — never just "wrong". This diagnosis drives both the feedback and the remediation decision.

4. **Score each rubric dimension** on the 4-band scale (Beginning / Developing / Proficient / Advanced): **accuracy**, **reasoning & process**, **conceptual understanding**, **communication**. Map the mean band to a mastery update using LEVELS.md: all-Proficient ≈ **0.85**, all-Advanced ≈ **1.0**, anything below Proficient **< 0.7**. At L4+ the gate is rubric-referenced — store ~0.85 numerically but require no dimension below Proficient.

5. **Give feedback in the Feed-Up / Feed-Back / Feed-Forward frame** (Shute's rules):
   - **Feed-Up** — restate the standard ("done well looks like…").
   - **Feed-Back** — name one specific strength and the specific gap, aimed at the PROCESS, not the person.
   - **Feed-Forward** — give one or two concrete next steps.
   Comments lead; any score is shown small and separate from the comment. Use growth framing throughout. Do NOT reveal a full answer the learner has not yet attempted independently.

6. **Consolidate productive-failure tasks.** If the assignment was flagged as a productive-failure task (a consolidation step is owed per its brief / entry note), DELIVER THE CONSOLIDATION now: compare the learner's attempt to the canonical solution, name what they tried and where it broke, and teach the principle the struggle exposed. Never leave a struggle un-consolidated — skipping this backfires (Kapur).

7. **Update state.** In the manifest:
   - Set the assignment entry `status:"graded"`.
   - For each targeted objective, write `mastery` (from step 4), increment `attempts`, and set `lastAssessed` to today.
   - If the learner predicted correct/incorrect (or gave a confidence), update `calibration`: `predictions += 1`, `hits += 1` on a match, and append to `calibration.log`.
   - For each missed item, add or reset a `reviewQueue` entry at **Box 1, due tomorrow** (`box:1`, `due` = today + 1 day; increment `lapses` if it already existed). Allocate any new review id as `r<max+1>`.
   - Append a `history` entry (`skill:"assess-understanding"`, the event, and the result).
   - Also append the assignment file's feedback section so the learner has a readable record.

8. **Decide — advance or remediate** using the PER-LEVEL gate (LEVELS.md). If **all** objectives in the current module clear the module's `masteryThreshold` (rubric-referenced at L4+, so no dimension below Proficient):
   - Mark the module `status:"mastered"`.
   - Unlock dependents: any module whose `prereqs` are now all `mastered` becomes `available`.
   - Point `current.moduleId` at the next available module — **lowest level, then lowest id** — and set `current.phase:"teach"`, `current.status:"in-progress"`.
   - If mastering this module completes the `scale.target` level (all modules through target are mastered), set `current.status:"capstone"` instead and leave `current.moduleId` as-is so `learn` routes to `capstone`.
   Otherwise **REMEDIATE**: set `current.phase:"remediate"`, leave the module `in-progress`, and route on the weakest objective — back to `teach-lesson` (re-teach the concept) if the gap is conceptual, or `create-assignment` (a targeted deliberate-practice drill) if the gap is procedural. Tell the user which command to run and why.

9. **Finish.** Bump `manifest.updated` to today, rewrite `progress.md` in the MANIFEST.md format, and append a line to `reviews.md` only if you reset/added review items. Tell the learner the single next step.

## State writes

This skill writes to `manifest.json`:
- `assignments[].status` → `submitted` (if it was still `open`) then → `graded`.
- `objectives[].mastery`, `objectives[].attempts`, `objectives[].lastAssessed` (single-writer — only this skill and `review-session` may touch mastery).
- `modules[].status` → `mastered` when the gate clears; dependent modules → `available`.
- `current.moduleId`, `current.phase`, `current.status`, `current.level` on advancement or remediation.
- `reviewQueue[]` — missed items added/reset at Box 1, due tomorrow (new ids = max suffix + 1).
- `calibration` (predictions, hits, log) when the learner predicted.
- `history[]` — one appended entry.
- `updated` — bump to today's date on every write.

Also rewrite `progress.md` in the exact format defined in MANIFEST.md (module map with real mastery numbers, the Next-action line, reviews-due surfaced, recent history). Append the feedback to the assignment file and, if reviews were reset, a line to `reviews.md`.

## Guardrails

- **State, not conversation.** Read `manifest.json` first, act, write it last (bump `updated`). Never assume `create-assignment` or any other skill ran this session — derive everything from disk.
- **Mastery is earned, never asserted.** Only this skill and `review-session` write `objective.mastery` and module/level status; write them strictly from measured performance, never from the learner's confidence.
- **Never reveal a full answer the learner has not yet attempted.** The learner generates their answer before any answer key is shown. Comments lead; a bare grade never crowds out the comment.
- **A module flips to `mastered` ONLY when all its objectives clear the threshold** (rubric-referenced at L4+: no dimension below Proficient). Never advance on a partial pass.
- **Any miss resets the item to Box 1, due tomorrow** — the failure is the signal.
- **Always consolidate a productive-failure task** before moving on.
- **Allocate ids as (max existing numeric suffix) + 1; never reuse an id.** Diagnose the SPECIFIC error, not just "wrong".

## Machine output (for the Lyceum app)

When run inside the **Lyceum desktop app**, in addition to the manifest writes, emit fresh follow-up retrieval items as a machine-readable quiz file the app can schedule and grade locally:

- Path: `quizzes/<moduleId>-<unixSeconds>.json`
- Shape:
  ```json
  { "items": [
    { "id": "q1", "stem": "…", "choices": ["…", "…"], "correct": 0,
      "rationale": "why", "objectiveIds": ["m03-o1"], "lane": "review" }
  ] }
  ```
- Use the `review` lane for spaced-recall items you seed into `reviewQueue`, and `formative` for ungraded checks. Mastery-bearing grading stays in THIS skill (the single writer) — never mark a `lane:"assignment"` item correct outside an assess turn. This file is **machine output only**; the human feedback still lives in the assignment file.
