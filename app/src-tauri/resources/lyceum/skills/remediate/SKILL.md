---
name: remediate
description: Re-teach a module's objectives that a learner just failed to master — a DIFFERENT explanation than the first lesson, then a fresh targeted practice. Use when an assessment did not clear the mastery gate (the learner got it wrong / "I still don't get this" / a module is stuck below threshold). Targets the specific weak objectives, not the whole module.
---

# remediate

The recovery step of the per-module loop. It runs **after a failed assessment**:
`teach-lesson → create-assignment → assess-understanding` → (gate not cleared) →
**remediate** → `assess-understanding` → … until the module is mastered. Where
`teach-lesson` delivers a module the first time, `remediate` re-teaches *only the objectives
that fell short* — a **different** way than the original lesson — and then issues one fresh,
tightly-targeted practice assignment so the next assessment can clear the gate.

It never asserts mastery. Re-teaching is not evidence of learning.

## Read first

Before doing anything, read these reference files (resolve the plugin root at install time):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, schema, ID-allocation
  rule, the single-writer rule, and the `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten principles; especially the hint
  ladder, dual coding, retrieval, self-explanation, and the productive-failure rule.
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale and per-level thresholds.
- `${CLAUDE_PLUGIN_ROOT}/references/GRAPHICS.md` — the graphics output contract (table ≈
  KaTeX > ASCII > mermaid > hand-SVG; `$$…$$` math; `assets/` naming; no raster/no remote).
- `${CLAUDE_PLUGIN_ROOT}/references/ASSIGNMENTS.md` — the analytic rubric and task types, so
  the re-drill you create is well-formed.

Then read the active subject manifest at `learning/<slug>/manifest.json`, plus
`knowledge-map.json` (misconceptions, concept summaries) and `curriculum.json` (objectives)
in the same folder. **If no manifest exists, STOP** and tell the user to run `lyceum:learn`.

Identify the module to remediate: the module at `current.moduleId`. It must be `taught` and
`in-progress` (not `mastered`). Identify the **weak objectives** — every objective whose
`mastery` is missing or **below the module's `masteryThreshold`**. These are your targets;
do not re-teach objectives the learner already cleared.

## Process

1. **Diagnose the gap — conceptual or procedural.** Re-read the graded assignment's
   feedback and the weak objectives' scores. Name the SPECIFIC misconception or the exact
   step that broke (the same diagnosis `assess-understanding` recorded). A **conceptual**
   gap (the learner misunderstands *why*) needs a new explanation; a **procedural** gap (the
   learner understands but slips in *execution*) needs worked examples and deliberate
   practice. Most failures are some of both — lead with whichever the evidence points to.

2. **Re-teach DIFFERENTLY — never repeat the first lesson.** Use a *new* representation: a
   different analogy or concrete model, a contrasting worked example, a smaller-step
   walk-through, or a different modality (a table/diagram where prose failed). Pull the
   relevant misconceptions from `knowledge-map.json` and confront them by name. Keep it tight
   — this is targeted repair of a few objectives, not a whole re-lecture.

3. **Dual-code and check understanding.** Pair each idea with an informative visual chosen
   per GRAPHICS.md (table/KaTeX first, then ASCII, then `mermaid`, then a hand-authored
   `.svg` in `assets/`). After each idea, pose a short retrieval or self-explanation check
   and let the learner attempt it before you continue. Use the hint ladder (pump → hint →
   prompt); never hand over the full answer.

4. **Write the remediation lesson file.** Save the re-teach to
   `lessons/<NN>-<module>-remediation.md`, where **`NN` is the module's own zero-padded
   number** (e.g. module `m02` → `02-m02-remediation.md`) so the lessons list attributes it
   to the right module. Overwrite it on a re-run rather than piling up files. If you emit any
   `.svg`, first `mkdir -p learning/<slug>/assets` and write it as `assets/<moduleId>-r<n>.svg`,
   referenced subject-root-relative per GRAPHICS.md.

5. **Create exactly ONE new targeted practice assignment.** Append a single new entry to
   `assignments[]` with a fresh id (`a<max existing numeric suffix + 1>`), `moduleId` = the
   current module, `status: "open"`, and `objectives[]` covering **all** the weak objectives
   from above (including any that were never scored) — so the next assessment can actually
   measure them and the gate can clear. Pick a task type from ASSIGNMENTS.md matched to the
   gap (a deliberate-practice drill for procedural, an explain-why / transfer task for
   conceptual) and set its `inputType`. Write the brief to the assignment's `file`. **Exactly
   one** open assignment — emitting zero would strand the learner; emitting two orphans one.

6. **Update state.** In the manifest:
   - Leave the module `status: "in-progress"` and `taught: true` (do NOT touch mastery or
     module status — those are read-only here).
   - Set `current.phase: "assign"` (a fresh drill is now waiting) and
     `current.status: "in-progress"`.
   - Append a `history` entry: `{ date, skill: "remediate", event: "re-taught <moduleId>
     (<objective ids>)", result: "issued targeted drill <assignmentId>" }`.
   - Bump `updated` to today.

7. **Finish.** Rewrite `progress.md` in the MANIFEST.md format (the Next-action line points
   at completing the new drill). Tell the learner, in growth framing, what you revisited and
   the single next step (do the new practice). Never frame remediation as punishment.

## State writes

Writes to `manifest.json` (then bump `updated`):
- `assignments[]` — exactly ONE new `open` entry on the current module (new id = max + 1),
  `objectives` covering all weak/unscored objectives.
- `current.phase` → `"assign"`, `current.status` → `"in-progress"`.
- `history[]` — one appended entry (`skill: "remediate"`).

Does **NOT** write: `objective.mastery`, `module.status`, `current.level`, certification —
all read-only here (only `assess-understanding` and `review-session` write mastery/status).

Also write the remediation lesson to `lessons/<NN>-<module>-remediation.md` and the new
assignment brief to its `file`, and rewrite `progress.md`.

## Guardrails

- **A different lesson, not a reprint.** If your re-teach reads like the original lesson, it
  is wrong — change the representation, the examples, or the grain size.
- **Target the weak objectives only.** Re-teach what fell short; don't re-lecture mastered
  objectives.
- **Exactly one new open assignment per turn.** Zero strands the learner (the app halts the
  step); two orphans one. Cover ALL weak/unscored objectives so the gate can clear.
- **Mastery is read-only.** Never write `objective.mastery` or flip `module.status` —
  remediation is teaching, and teaching is not evidence. The next `assess-understanding`
  decides whether the gate clears.
- **Allocate ids as (max existing numeric suffix) + 1.** Never reuse an id.
- **Graphics follow GRAPHICS.md.** No raster or remote-URL images; math is `$$…$$` only;
  file SVGs go in `assets/` and are referenced subject-root-relative, never `../`.
- **State, not conversation.** Read the manifest first, write it last (bump `updated`); keep
  it valid JSON. Never assume another skill ran this session.

## Machine output (for the Lyceum app)

When run inside the **Lyceum desktop app**, also write the re-teach's checks-for-understanding
to a machine-readable quiz file so the app can render and grade them locally:

- Path: `quizzes/<moduleId>-<unixSeconds>.json`
- Shape:
  ```json
  { "items": [
    { "id": "q1", "stem": "…", "choices": ["…", "…"], "correct": 0,
      "rationale": "why", "objectiveIds": ["m03-o1"], "lane": "formative" }
  ] }
  ```
- Use `formative` for ungraded checks and `review` for spaced-recall seeds. Mastery-bearing
  grading stays in `assess-understanding` (the single writer) — a `remediate` turn never
  asserts mastery. This file is **machine output only**; the human re-teach lives in the
  lesson file.
