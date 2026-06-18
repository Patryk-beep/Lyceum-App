# Lyceum — a portable, evidence-based meta-learning system

Lyceum is a chain of **nine Claude Code skills** that teach you *any* subject — languages, math, history, music, programming, woodworking — from absolute beginner to mastery, using the techniques with the strongest support in learning science. The skills coordinate through **one state file per subject**, so a course can pause, resume across sessions, survive a context reset, and transfer to any machine: you just copy the folder.

## Design goals

- **Portable** — a self-contained plugin; all memory lives on disk as plain files, not in the conversation.
- **Evidence-based** — every mechanic traces to a cited finding (retrieval practice, spacing, interleaving, deliberate practice, mastery learning, backward design). No folk pedagogy.
- **Composable** — each skill runs standalone *or* as part of the chain. They communicate only through the state file, never by assuming a previous skill ran in the same session.
- **Subject-agnostic** — domain behavior is data in the curriculum, not hardcoded logic.

## The nine skills

| Skill | Purpose |
|---|---|
| `lyceum:learn` | Orchestrator / entry point. Sets up the workspace, captures your start & target level, routes to the right next step. |
| `lyceum:research-topic` | Deep research → a teachable knowledge map (concepts, prerequisites, misconceptions, level descriptors, authentic tasks). |
| `lyceum:placement-test` | ~10-item adaptive test → a recommended starting level. |
| `lyceum:build-curriculum` | Backward-designed curriculum across your level band, ordered by a prerequisite graph. |
| `lyceum:teach-lesson` | Teaches the current module (concrete-first, checks for understanding, free-recall close, seeds reviews). |
| `lyceum:create-assignment` | A level-appropriate assignment + rubric, calibrated to the edge of ability. |
| `lyceum:assess-understanding` | Grades a submission, gives feedback that teaches, updates mastery, schedules reviews. The tracking engine. |
| `lyceum:review-session` | Spaced-repetition review of due items (the biggest long-term-retention lever). |
| `lyceum:capstone` | An authentic, defended, rubric-scored mastery project + certification. |

## How to use it

Just say what you want to learn — e.g. *"I want to learn the Roman Republic, get me to seminar level"* — and `lyceum:learn` takes over: it sets up the workspace, asks for your target (and offers a placement test for your start), then walks you through research → curriculum → teach → assign → assess → review per module, gating each on measured mastery, until a capstone certifies you. Ask **"what's next?"** any time and `learn` reads the state and tells you.

## Two things are portable, independently

- **The plugin** — install once, use in any session/project (see install below).
- **Your learner state** — the `learning/<subject>/` folder is plain files. Copy it to another machine or project and any session with Lyceum resumes exactly where it left off. **That folder is the save file.**

## Install (local marketplace)

From Claude Code, point it at this marketplace directory and install the plugin:

```
/plugin marketplace add <path-to>/lyceum-marketplace
/plugin install lyceum@lyceum-marketplace
```

Then restart the session (or reload plugins). All nine skills become available as `lyceum:<skill>` in every session. If you move the `lyceum-marketplace` folder, re-run `/plugin marketplace add` with the new path.

## How it works (the architecture)

- **State, not conversation.** Each skill reads `manifest.json`, acts, and writes it back. Nothing depends on what happened earlier in the same chat — routing is always computed from disk. See `references/MANIFEST.md`.
- **Single writer for mastery.** Only `assess-understanding` and `review-session` ever write mastery scores. Teaching and assignment-creation are read-only on mastery, so "feeling fluent" never inflates the data.
- **Shared brain.** All skills load `references/REFERENCE.md` (the ten pedagogical principles) so the chain pulls in one direction. Level reasoning lives in `references/LEVELS.md`, the task catalog in `references/ASSIGNMENTS.md`, and the placement blueprint in `references/PLACEMENT.md`.

## Layout

```
lyceum/
├── .claude-plugin/plugin.json
├── README.md
├── skills/
│   ├── learn/ research-topic/ placement-test/ build-curriculum/
│   ├── teach-lesson/ create-assignment/ assess-understanding/
│   └── review-session/ capstone/          # each a SKILL.md
└── references/
    └── MANIFEST.md  REFERENCE.md  LEVELS.md  ASSIGNMENTS.md  PLACEMENT.md
```

Built from the *Praxis / Lyceum* design specification and three bundled research reports (~125 sources across learning techniques, curriculum design, and assessment).
