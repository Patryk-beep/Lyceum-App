---
name: create-assignment
description: Create an assignment, exercise, problem set, or practice task for the current module of a learning course. Use when the user asks for an assignment/exercise/homework/practice/problems on a topic, or after a lesson is delivered. Selects evidence-based task types matched to the learner's level and targets their weak spots.
---

# create-assignment

Builds a level-appropriate assignment with a single-point rubric for the current module, calibrated to the edge of the learner's ability. In the chain it follows `teach-lesson` and feeds `assess-understanding`, which grades the submission.

## Read first

Before doing anything, read these reference files (they carry the rules this skill must follow — do not reinvent them):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract: schema, ID allocation, single-writer-for-mastery rule, and the `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles (retrieval, interleaving, deliberate practice, desirable difficulty, productive-failure consolidation).
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale, Bloom verb bank, and per-level mastery context.
- `${CLAUDE_PLUGIN_ROOT}/references/ASSIGNMENTS.md` — the task-type catalog, the single-point analytic rubric, productive-failure phases, and difficulty calibration.

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists (or it is unreadable), STOP and tell the user to run `lyceum:learn` first — this skill never creates the workspace and never assumes another skill ran this session.

## Process

1. **Locate the target.** From the manifest read `current.moduleId` and find that module in `modules[]`. Read its `level`, `title`, and `objectives[]`. Confirm the module's `taught` is true (a lesson should precede the assignment); if not, note it and proceed only if the user explicitly asked for practice anyway.

2. **Find weak spots (deliberate practice).** Inspect the targeted module's objectives for any with `mastery` below the module's `masteryThreshold`, and scan `history`/`current.phase` for a flagged weak objective (e.g. `phase == "remediate"`). If a weak objective exists, make the assignment **target it specifically** rather than generic coverage.

3. **Select task type(s) from the catalog.** Using the ASSIGNMENTS.md table, pick task type(s) matched to the module's `level` and objectives (L1–2: recall, worked-example-with-faded-steps, guided practice; L3–4: performance tasks, productive failure; L5–6: projects, problem-based scenarios, teach-it tasks). Match the Bloom verb in each objective to the task.

4. **Interleave.** Mix task types within the brief rather than a single monotype. Once prior modules exist in `modules[]`, fold in **one or two items drawn from earlier (already-taught) material** so the set is mixed, not blocked by topic. Do not interleave a confusable skill on its very first exposure.

5. **Write the brief** to a learner-visible section containing:
   - **Instructions** for each task, in order.
   - **Objective(s) targeted** (list the objective ids and text).
   - **The standard** — a concrete "done well looks like…" statement so the learner knows the goal (Feed-Up).
   - **A single-point analytic rubric** — describe **only the Proficient column** for each dimension (correctness/accuracy, reasoning/process, conceptual understanding, communication/clarity; rename per task), leaving open blank space for "below" and "above". Do not fill in the off-bands.
   - A clearly marked **SUBMISSION PLACEHOLDER** where the learner writes their answer.

6. **Calibrate difficulty.** Aim the task at the edge of current ability — effortful but achievable with current scaffolding (desirable difficulty, inside the ZPD). If recent history shows the learner sailing through, raise difficulty; if they cannot get traction even with hints, drop back a notch.

7. **Handle productive-failure tasks specially.** If you assign a productive-failure (struggle-before-instruction) problem, state in **both** the brief AND the `assignments[]` entry note that a **consolidation step is owed afterward**, so `assess-understanding` delivers the canonical solution against the attempt. A productive-failure task without flagged consolidation is incomplete.

8. **Allocate the id and file.** New assignment id = (max existing numeric suffix in `assignments[]`) + 1 (e.g. `a05` → `a06`); never reuse an id. Compute the file name `assignments/NN-<moduleId>-<type>.md`, where `NN` is the zero-padded numeric part of the id and `<type>` is a short slug of the chosen task type.

9. **Save the file and update state.** Write the brief to that path (keeping the answer key OUT of it — see Guardrails), then perform the State writes below.

## State writes

- Append one entry to `manifest.json` `assignments[]`:
  `{ id, moduleId, type, file, objectives, status: "open" }`.
  For a productive-failure task, add a `note` recording that a consolidation step is owed.
- Set `current.phase = "assign"` (and keep `current.status = "in-progress"`).
- Bump `updated` to today's date (`2026-06-17`).
- Rewrite `progress.md` in the exact format defined in MANIFEST.md (header line, "Where you are", module map, recent history), reading mastery values straight from the manifest — never invent them.
- Optionally append a one-line entry to `history` noting the assignment was created.

Do **NOT** write `objective.mastery`, `module.status`, or `current.status` level transitions — mastery is read-only here; only `assess-understanding` and `review-session` write it.

## Guardrails

- **Never reveal answers before an attempt.** Keep the answer key, worked solution, or rubric off-bands entirely OUT of the learner-visible file — hold them for `assess-understanding`. If you must record solution notes, do not put them where the learner reads them.
- **Mastery is read-only.** Do not touch `objective.mastery` or module/level status.
- **State, not conversation.** Read the manifest first, act, write it last (bump `updated`). Never assume `teach-lesson` ran this session — confirm from disk.
- **Allocate, never reuse, ids.** Assignment id = max existing suffix + 1.
- **Always interleave and always withhold answers until an attempt** (ASSIGNMENTS.md default policy).
- **Productive-failure tasks must flag the owed consolidation** in both the brief and the `assignments[]` note, or do not use that task type.
- **Single-point rubric only** — describe the Proficient column; leave the below/above space open. Do not pre-grade.
