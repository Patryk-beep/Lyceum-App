---
name: capstone
description: Design and evaluate a capstone project that proves practical mastery of a subject at the target level. Use when all modules through the target level are mastered, or when the user asks for a final/capstone project, or to 'prove I've really learned X'. Includes milestones, a public-style defense, and a mastery rubric.
---

# capstone

The final gate of a Lyceum course: an authentic, defended, rubric-scored project that certifies mastery at the target level. It runs after every module through `scale.target` is mastered. It is the only skill that writes the `certification` block and the terminal `current.status = "certified"`; it never writes `objective.mastery` or a module's `mastered` status (those stay owned by `assess-understanding` and `review-session`).

## Read first

Before doing anything, read these reference files (they carry the contracts and rationale — do not duplicate them here):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, the manifest schema, the single-writer rule, and the `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles (especially feedback, retrieval, calibration, mastery gating).
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale, so the capstone is scaled to `scale.target`.
- `${CLAUDE_PLUGIN_ROOT}/references/ASSIGNMENTS.md` — the authentic task types (project, problem-based scenario, teach-it, capstone/portfolio) and the rubric conventions.

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists (or it is unreadable), **STOP** and tell the user to run `lyceum:learn` first — never invent state. Resolve `<slug>` from the active subject; if more than one subject exists, confirm which one with the user.

## Process

1. **Confirm the gate.** Read `scale.target` and `modules[]`. Verify that every module at or below `scale.target` has `status:"mastered"`. If some are not yet mastered, do not start a capstone — tell the user which modules remain and route them back to the course loop (`lyceum:teach-lesson` / `lyceum:create-assignment` / `lyceum:assess-understanding`). The exception: the user may explicitly request a capstone anyway; if so, proceed but note in the brief that unmastered modules remain.

2. **Design an authentic capstone scaled to `scale.target`.** Draw the driving question and deliverable from `knowledge-map.json` `authenticTasks` and `levelDescriptors` for the target level. Scale the ambition to the level band:
   - **L3–L4:** a bounded performance task with guidance — a constrained authentic deliverable with a clear spec.
   - **L5:** an open project on an ambiguous, real problem the learner frames themselves.
   - **L6:** an original contribution that extends the field or teaches it (a novel method, artifact, or instructional work).
   The design must include all of: a **driving question**; a **real deliverable for an audience beyond the tutor** (name the audience explicitly — e.g. a peer, a community, a portfolio reviewer); **milestones** in the sequence **inquiry → plan → build → critique-and-revise → final**; a required **self-reflection**; and a short **oral-style defense** (a Q&A you will run at submission).

3. **Share the analytic rubric up front.** Before any work begins, give the learner the full rubric — they should know the standard they are aiming for. Use these seven criterion-referenced criteria, each scored on 4 bands (Beginning / Developing / Proficient / Advanced):
   - Problem framing & inquiry
   - Domain knowledge & accuracy
   - Application & problem-solving
   - Deliverable quality & authenticity
   - Critique & revision
   - Communication & defense
   - Self-reflection

   Write the brief, the milestones, the rubric, and the defense format into `capstone.md`.

4. **Coach through the milestones.** Walk the learner milestone by milestone (inquiry → plan → build → critique-and-revise → final). At each, prompt, question, and give graduated hints (pump → hint → prompt) — but **do not produce the work for the learner**. The deliverable must be theirs. Hold the rubric in front of them as the standard at each stage. Never reveal an answer-key or write the artifact on their behalf.

5. **Run the defense at submission.** When the learner submits the final deliverable and self-reflection, run the **oral-style defense Q&A**: ask probing questions that test depth, justification of choices, awareness of trade-offs and limitations, and transfer beyond the artifact. Require the learner to answer each question **before** you offer any assessment or model response.

6. **Score every criterion.** After the defense, score all seven criteria on the 4-band scale, criterion-referenced (against the rubric description, not against other learners). Note specifically where each criterion landed and why.

7. **Certify or route to revision.** Certify mastery at `scale.target` **only if NO criterion is below Proficient AND at least 75% of criteria are in the Advanced (top) band**. (Seven criteria → at least 6 Advanced, none below Proficient.)
   - **On pass:** write the certification block and the portfolio note (see State writes), and tell the learner they are certified at the target level.
   - **On not-yet:** do **not** issue a terminal grade. Deliver feed-forward in the Feed-Up / Feed-Back / Feed-Forward frame (restate the standard, name the specific gap at the process level, give one or two concrete next steps), then route into a **critique-and-revise** cycle: have the learner revise the weak criteria and resubmit. Re-run the defense and re-score on resubmission.

## State writes

Write these back to `learning/<slug>/manifest.json`, then bump `updated` to today (2026-06-17):

- **On pass only — `certification`:** set the block to
  `{ "certified": true, "level": <scale.target>, "date": "<today>", "criteria": [{ "name": "<criterion>", "band": "<band>" }, ...], "deliverable": "<short description of the artifact + its audience>", "notes": "<defense summary and standout strengths>" }`.
- **On pass only — `current`:** set `current.status = "certified"` (and `current.phase = "capstone"`). This terminal certification value is written only by `capstone`. (Mastery scores — `objective.mastery` and a module's `mastered` status — remain owned by `assess-understanding` and `review-session`; `capstone` never writes those.)
- **`history`:** append an entry `{ "date": "<today>", "skill": "capstone", "event": "<designed | coached milestone | ran defense | certified | routed to revise>", "result": "<verdict>" }`.
- **Mastery is READ-ONLY here.** Never write `objective.mastery` or `module.status` — those belong to `assess-understanding` and `review-session` only.
- **Rewrite `progress.md`** in the exact format defined in MANIFEST.md (header, "Where you are", module map, recent history). On a pass, add a **portfolio note** under the dashboard recording the certified deliverable, its audience, the target level, and the date.
- Keep `capstone.md` current with the brief, milestones, rubric, defense transcript, scores, and verdict.
- Leave the manifest valid JSON after every write.

## Guardrails

- **State, not conversation.** Read `manifest.json` first; never assume another skill ran this session. If it is missing, stop and send the user to `lyceum:learn`.
- **Mastery is read-only for this skill.** Never touch `objective.mastery` or a module's `mastered` status. Writing `current.status = "certified"` on a pass is the one `current`-block transition this skill owns.
- **The learner generates first.** Never reveal a defense answer, model solution, or the artifact itself before the learner has attempted it. Coach with hints (pump → hint → prompt); do not do the work for them.
- **Hold the certification line.** Certify only when **no criterion is below Proficient and ≥75% are Advanced**. A miss is never a terminal grade — it routes to a critique-and-revise cycle with feed-forward.
- **Authenticity is mandatory.** The deliverable must target a real audience beyond the tutor, and the project must be scaled to `scale.target` (bounded task at L3–4, open project at L5, original contribution at L6).
- **Allocate ids as (max existing numeric suffix) + 1; never reuse an id** (applies to any history or item ids touched).
- **Always bump `updated`** and keep the manifest valid JSON.
