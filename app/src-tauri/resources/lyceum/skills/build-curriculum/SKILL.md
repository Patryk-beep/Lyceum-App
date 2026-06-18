---
name: build-curriculum
description: Build a structured curriculum / course / syllabus / learning path for a subject, from a chosen starting level to a target level. Use after research (and placement) is done, or when the user asks to create a course, study plan, syllabus, roadmap, or 'curriculum from beginner to expert' for a subject. Produces modules with measurable objectives ordered by prerequisites.
---

# build-curriculum

Turn the knowledge map into a backward-designed course that spans exactly `[scale.start, scale.target]`: modules with measurable objectives, ordered by prerequisites, building toward a capstone. In the chain it runs after `research-topic` (and `placement-test` when start was `"test"`) and before `teach-lesson`.

## Read first

Read these reference files before doing anything else, in this order:

1. `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, the `manifest.json` schema (especially `modules[]`), the two non-negotiable contracts, the ID-allocation rule, and the `progress.md` format.
2. `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles, especially backward design and mastery gating.
3. `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale, the Bloom verb bank, and the per-level mastery thresholds.

Then read the active subject manifest at `learning/<slug>/manifest.json` to load `scale`, `placement`, and `current`. Also read `learning/<slug>/knowledge-map.json` (the machine contract this skill is built from).

If no manifest exists at `learning/<slug>/manifest.json`, **STOP** and tell the user to run `lyceum:learn` first to set up the subject. Do not invent a workspace. If the manifest exists but `knowledge-map.json` is missing, STOP and tell the user to run `lyceum:research-topic` first.

Resolve `scale.start` and `scale.target` from the manifest. `scale.start` must be a numeric integer here (placement overwrites the `"test"` sentinel) — if it is still `"test"`, STOP and tell the user to run `lyceum:placement-test`. The resolved `scale.start` is the authoritative lower bound of curriculum scope; `scale.target` is the upper bound.

## Process

1. **Backward design first.** For `scale.target`, state the *desired outcomes* — pull them from `knowledge-map.levelDescriptors[target]` and the `authenticTasks` at or near the target level. Then state the *evidence* that would prove those outcomes: sketch a capstone (the authentic final deliverable the whole course builds toward) plus the per-module checks that ladder up to it. Write the outcomes and evidence down before planning any module — the modules are derived from this, not the other way around.

2. **Plan modules backward, then order them forward.** Working from the target outcomes back down to `scale.start`, decompose the `knowledge-map.concepts` into modules:
   - Cluster related concepts so that **each module sits at exactly ONE level** (a concept's `entryLevel` places it).
   - Generate modules **ONLY within `[scale.start, scale.target]`** — drop concepts whose `entryLevel` is below `start` or above `target`.
   - Build the prerequisite DAG from `concept.prereqs` (lifted to the module level) and order modules by a **topological sort** of that DAG, so no module precedes one it depends on.
   - Make the sequence lightly **spiral**: revisit anchor concepts at higher levels with more depth rather than treating each as one-and-done. A spiral revisit is a new higher-level module that lists the earlier module as a prereq.

3. **Write objectives per module.** Give each module 2–4 **measurable, Bloom-tagged objectives** in `verb + object + standard` form. Choose the verb from the LEVELS.md verb bank so it **matches the module's level band** (e.g. L1 "list / identify", L2 "explain / apply", L4 "evaluate / justify", L6 "design / originate"). Each objective gets an `id` of `<moduleId>-o<n>` and a `bloom` tag. Surface the relevant `knowledge-map.misconceptions` in `curriculum.md` so teaching can target them, but do not encode them as objectives.

4. **Set `masteryThreshold` per level** (from LEVELS.md):
   - L1–L2 modules → **0.90**
   - L3 modules → **0.85**
   - L4–L6 modules → **0.85** (rubric-referenced: store 0.85 numerically; the real gate is the rubric in `assess-understanding`).

5. **Initialize module state.** For each module set `taught: false` and `status`: `available` if all its `prereqs` are already `mastered` (modules with empty `prereqs` at `scale.start` are available), else `locked`. Do **not** set `objective.mastery` on any objective — leave mastery unset until `assess-understanding` measures it. Allocate module ids `m01`, `m02`, … in topological order, zero-padded to two digits; never reuse an id.

6. **Set the cursor.** Point `current.moduleId` at the first available module (**lowest level, then lowest id**). Set `current.level = scale.start` and `current.phase = "teach"`. Do **not** touch `current.status` here — leave it exactly as `learn` left it (`"not-started"`); `teach-lesson` is what flips it to `"in-progress"`.

7. **Write the artifacts.**
   - `learning/<slug>/curriculum.md` — readable: organized levels → modules → objectives → how each objective is assessed → the capstone it builds toward. Include the backward-design outcomes/evidence and capstone sketch at the top, and the surfaced misconceptions per module.
   - `learning/<slug>/curriculum.json` — the `modules[]` array, EXACTLY matching the MANIFEST.md schema: each module has `id`, `title`, `level`, `prereqs` (array of real module ids), `status`, `taught`, `masteryThreshold`, and `objectives[]` (each with `id`, `text`, `bloom`).

## State writes

Write back to `learning/<slug>/manifest.json`:
- `modules[]` — the full curriculum array (same content as `curriculum.json`), with `status`, `taught: false`, `masteryThreshold` (per-level), and `objectives[]` carrying **no** `mastery` field yet.
- `current.moduleId` (first available), `current.level = scale.start`, `current.phase = "teach"`. (Leave `current.status` untouched.)
- Append a `history` entry (date, skill `build-curriculum`, event, result, e.g. "built N-module curriculum L<start>–L<target>").
- Bump `updated` to today's date.

Also write `curriculum.md` and `curriculum.json`, and **rewrite `progress.md`** in the exact format defined in MANIFEST.md (Where you are / Module map table / Recent history). In the Module map, show `Mastery` as `—` for every module (none assessed yet) and `Taught` as `no`.

Do **not** write `objective.mastery` or mark any module `status: "mastered"` — those belong solely to `assess-understanding` and `review-session` (single-writer rule). Do not change `current.status` here.

## Guardrails

- **Mastery is read-only here.** Never write `objective.mastery`; never mark a module `mastered`. Leave objective mastery unset until it is assessed.
- **Scope is hard-bounded.** Generate modules only within `[scale.start, scale.target]`. No module below `start` or above `target`; one level per module.
- **Respect the prerequisite DAG.** Every `prereqs` entry must reference a real module id; the module order must be a valid topological sort (no module before its prerequisites). A module is `available` only when all prereqs are `mastered` — at build time that means start-level modules with no unmet prereqs.
- **Measurable, level-matched objectives only.** Use `verb + object + standard`; pick the verb from the level-appropriate band in the LEVELS.md verb bank.
- **Thresholds by level, not a flat default:** 0.90 (L1–L2), 0.85 (L3), 0.85 rubric-referenced (L4–L6).
- **Never reuse an id.** Allocate new ids as (max existing numeric suffix) + 1.
- **State, not conversation.** Read `manifest.json` first, act, write it last and bump `updated`. Never assume another skill ran this session; if the manifest is missing, stop and route to `lyceum:learn`.
