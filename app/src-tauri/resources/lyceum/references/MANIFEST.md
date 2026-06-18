# MANIFEST.md — the state contract

**Every Lyceum skill reads this file first.** It defines the shared state file (`manifest.json`), the workspace layout, the two contracts that make the chain portable, and the exact format of the human-readable `progress.md` dashboard.

`manifest.json` is the single source of truth and the handoff artifact between skills and between sessions. Keep it **small and always valid JSON**.

---

## The two contracts (non-negotiable)

1. **State, not conversation.** A skill never assumes another skill ran in this session. It **reads `manifest.json`, acts, then writes `manifest.json`** (bumping `updated`). If the manifest is missing or unreadable, the skill stops and tells the user to run `learn`. Routing and progress are always *computed from disk*, so any fresh session resumes correctly.

2. **Single writer for mastery.** Only **`assess-understanding`** and **`review-session`** may write **`objective.mastery`** and flip a module to **`status: "mastered"`**. Every other skill treats *mastery* as **read-only** — teaching, placement, and assignment-creation never assert it. This keeps the "illusion of competence" (REFERENCE.md, principle 8) out of the data: mastery is *earned through measured performance*, never claimed by a teaching step.

   The **`current` navigation block** (`level`, `moduleId`, `phase`, `status`) is *not* mastery data — it records *where the learner is now*, and whichever skill moves the learner updates it (per that skill's spec): `learn` initializes it; `placement-test` sets `current.level`; `build-curriculum` sets `current.moduleId`/`level`/`phase`; `teach-lesson` sets `current.phase` and `current.status:"in-progress"`; `assess-understanding` advances `current` (including `status:"capstone"`) as the mastery gate dictates; `capstone` alone writes `current.status:"certified"`. The mastery-bearing outcomes inside this block — a module becoming `mastered`, and the `current.status` values `capstone` / `certified` — are produced only by the gate (`assess-understanding`) and the final certification (`capstone`), never by a teaching or setup step.

---

## Workspace layout

One folder per subject, created by `learn`, at the project root (current working directory) by default:

```
learning/
└── <subject-slug>/
    ├── manifest.json          # THE state file. Single source of truth.
    ├── research.md            # research-topic output (human-readable, cited)
    ├── research.html          # optional styled copy for reading (themeable)
    ├── knowledge-map.json     # research-topic output (machine-readable contract)
    ├── curriculum.md          # build-curriculum output (human-readable)
    ├── curriculum.json        # build-curriculum output (machine-readable)
    ├── placement.md           # placement-test transcript + result
    ├── lessons/
    │   └── 01-<module>.md      # one file per delivered lesson
    ├── assignments/
    │   └── 01-<module>-<type>.md   # brief + learner submission + feedback, one file
    ├── reviews.md             # human-readable review log (the queue lives in manifest)
    ├── progress.md            # running human-readable dashboard (format below)
    └── capstone.md            # capstone brief, milestones, evaluation
```

`.md` files are for the human to read; `.json` files are the contract downstream skills parse. Keep them separate so prose never has to be parsed.

---

## `manifest.json` schema

```json
{
  "subject": "Conversational Spanish",
  "slug": "conversational-spanish",
  "created": "2026-06-17",
  "updated": "2026-06-17",
  "scale": { "start": 2, "target": 4 },
  "current": { "level": 2, "moduleId": "m03", "phase": "assign", "status": "in-progress" },
  "placement": {
    "taken": true,
    "date": "2026-06-17",
    "recommendedLevel": 2,
    "evidence": "floor at L2 (sustained), ceiling at L3 (broke on subjunctive)"
  },
  "modules": [
    {
      "id": "m01",
      "title": "Sound system & greetings",
      "level": 1,
      "prereqs": [],
      "status": "mastered",
      "taught": true,
      "masteryThreshold": 0.90,
      "objectives": [
        { "id": "m01-o1", "text": "Produce the five vowel sounds accurately", "bloom": "Apply", "mastery": 0.9, "attempts": 2, "lastAssessed": "2026-06-17" }
      ]
    }
  ],
  "assignments": [
    { "id": "a05", "moduleId": "m02", "type": "performance-task", "file": "assignments/05-m02-performance-task.md", "objectives": ["m02-o1"], "status": "graded" }
  ],
  "reviewQueue": [
    { "itemId": "r014", "prompt": "How do you ask someone's name (formal)?", "answer": "¿Cómo se llama usted?", "moduleId": "m01", "box": 3, "due": "2026-06-24", "lastResult": "pass", "lapses": 0 }
  ],
  "calibration": { "predictions": 12, "hits": 7, "log": [{ "date": "2026-06-17", "predicted": "correct", "actual": "incorrect" }] },
  "certification": null,
  "history": [
    { "date": "2026-06-17", "skill": "assess-understanding", "event": "graded m02 assignment", "result": "Proficient; advanced to m03" }
  ],
  "settings": { "scheduler": "leitner", "retentionTarget": 0.90, "sessionLengthMin": 30, "htmlTheme": "default" }
}
```

---

## Field notes that matter for correctness

- **`scale.start`** — an integer 1–6, **or** the string `"test"` meaning "run `placement-test` to decide." `placement-test` **overwrites it with the chosen integer**, so downstream skills always read a number. **`scale.target`** is an integer 1–6. The resolved `scale.start` is the **single source of truth for curriculum scope**; `current.level` is just where the learner is now.
- **`current.phase`** ∈ `teach | assign | assess | remediate | capstone` — written by the last skill so `learn` can resume mid-loop without re-deriving everything from files. **`current.status`** ∈ `not-started | in-progress | mastered | capstone | certified`.
- **`module.status`** ∈ `locked | available | in-progress | mastered`. A module is `available` only when all `prereqs` are `mastered` (this enforces the prerequisite graph). **`module.taught`** (bool) records that `teach-lesson` delivered it — distinct from mastery. When several modules become available at once, `current.moduleId` points to the **lowest level, then lowest id**.
- **`module.masteryThreshold`** — default **per level** (see LEVELS.md §thresholds): **0.90** at L1–L2 (recall/procedural objectives), **0.85** at L3, and **rubric-referenced** at L4–L6 (store ~0.85 numerically but gate on the rubric, not a bare percentage). `build-curriculum` sets it; the gate lives in `assess-understanding`.
- **`assignments[]`** tracks lifecycle so routing never parses prose: `status` ∈ `open` (created) → `submitted` (handed in) → `graded`. `create-assignment` appends `open`; `assess-understanding` sets `graded`. Submission is usually conversational — when the learner pastes an answer, `assess-understanding` triggers and first flips the relevant entry to `submitted`.
- **`objective.mastery`** is 0.0–1.0. **Only `assess-understanding` and `review-session` write it.** Every other skill treats it as read-only.
- **`reviewQueue[].box`** is the Leitner box `1–6` or `"retired"` (a Box-6 item that passes again stops recycling). `due` is an ISO date. **New ids are allocated as max existing numeric suffix + 1** (`r014` → `r015`) so two sessions never collide.
- **`certification`** is `null` until `capstone` certifies, then `{ certified: true, level, date, criteria: [{name, band}], deliverable, notes }`.
- **Concurrency:** assume one active session per subject (last-writer-wins). The "copy the folder" portability story means *move* the folder; don't edit two copies at once.

### ID allocation (all skills follow this)

- Modules: `m01`, `m02`, … (zero-padded to 2). Objectives: `<moduleId>-o<n>` (e.g. `m03-o2`).
- Assignments: `a01`, `a02`, … Review items: `r001`, `r002`, …
- Always allocate **(max existing numeric suffix) + 1**. Never reuse an id.

---

## `progress.md` format (write this shape every time)

Every skill that changes state rewrites `progress.md` so the learner always has one readable dashboard. Keep it to this structure (fill the real values):

```markdown
# Progress — <Subject>

_Updated <YYYY-MM-DD> · Level <current.level> of target <scale.target> · Status: <current.status>_

## Where you are
- **Current module:** <moduleId> — <title> (L<level>), phase: <phase>
- **Next action:** <one line: the single command/step to run next, and why>
- **Reviews due today:** <N> (run `review-session`)  ·  **Calibration:** <hits>/<predictions> correct self-predictions

## Module map
| Module | Level | Status | Mastery | Taught |
|---|---|---|---|---|
| m01 — <title> | 1 | mastered | 0.90 | yes |
| m02 — <title> | 2 | in-progress | 0.62 | yes |
| m03 — <title> | 2 | available | — | no |
| … | | locked | — | no |

## Recent history
- <YYYY-MM-DD> · <skill> · <event> → <result>
- … (most recent 5–8 entries; full log lives in manifest.history)
```

Rules: the **Mastery** column shows the module's mean objective mastery (or `—` if never assessed). The **Next action** line mirrors what `learn` would route to. Reviews are surfaced here even when they're not the primary next step (they are orthogonal). Never invent mastery numbers — read them from the manifest.
