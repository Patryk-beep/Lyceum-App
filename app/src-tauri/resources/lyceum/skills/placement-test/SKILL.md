---
name: placement-test
description: Assess a learner's current level with a short, INTERACTIVE adaptive test — you ask one question, the learner answers, you grade it and ask the next, then recommend where to start. Use when the user says 'test my skills/level', 'where should I start', 'how much do I already know', when placement is requested, or whenever the course's start is set to 'test'. Produces a recommended starting level 1-6.
---

# placement-test

Decide where the learner should start, through a short **interactive** placement: you ask one adaptive question, the learner answers it in the app, you grade that answer and ask the next — deciding the level yourself. Runs after `research-topic` (it needs the knowledge map) and before `build-curriculum`; the router reaches it when `scale.start == "test"` and `placement.taken != true`.

**One turn = one exchange.** Each time this skill runs you do exactly ONE of: open with the first question, grade the latest answer and ask the next, or finalize. You coordinate across turns through two files — you never hold a live back-and-forth in a single turn.

## Read first

Read these reference files before doing anything (paths resolve once the plugin is installed):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, schema, and `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles (retrieval over recognition, calibration).
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale you are classifying into.
- `${CLAUDE_PLUGIN_ROOT}/references/PLACEMENT.md` — the adaptive logic and floor/ceiling → level table. **This is the authoritative blueprint; follow it exactly.**

Then read the active subject manifest at `learning/<slug>/manifest.json`. **If no manifest exists, STOP** and tell the user to run `lyceum:learn` first — this skill does not create the workspace. Also confirm `knowledge-map.json` exists in the same folder; if it is missing, STOP and tell the user to run `lyceum:research-topic` first (you draw questions from it).

## The two coordination files (in `learning/<slug>/`)

- **`placement-state.json`** — **YOURS.** You own it and rewrite it every turn. Shape:
  ```json
  { "asked": 2, "maxQuestions": 8,
    "current": { "id": "q3", "tier": 4, "question": "…" },
    "lastFeedback": "Close — you named retrieval but missed spacing.",
    "history": [
      { "id": "q1", "question": "…", "answer": "…", "verdict": "correct", "feedback": "…" }
    ],
    "done": false, "recommendedLevel": null, "rationale": null }
  ```
  When the run is complete: `"current": null, "done": true, "recommendedLevel": <int 1–6>, "rationale": "<one-line floor/ceiling summary>"`.
- **`placement-answer.json`** — the **APP's** (read-only to you). Shape `{ "id": "q3", "answer": "…" }`. Grade it **only when its `id` equals your `current.id`** — otherwise it is a stale leftover; ignore it.

## Choose your mode (decide it from the files)

1. **No `placement-state.json` yet** → **OPEN.** Draw a first question from `knowledge-map.json` at a mid tier (≈3). Keep it short, retrieval-based, with a single expected answer. Write `placement-state.json` with `asked: 1`, `maxQuestions: 8`, `current: { "id": "q1", "tier": 3, "question": … }`, `lastFeedback: null`, `history: []`, `done: false`, `recommendedLevel: null`, `rationale: null`. Then STOP.

2. **`done: false` AND `placement-answer.json` exists with `id == current.id`** → **GRADE + ASK.**
   - Judge the typed answer against what a learner at `current.tier` should produce: `verdict ∈ correct | partial | incorrect`. Write a 1–2 sentence `lastFeedback` (what was right or missing — **never** the answer to the next question).
   - Append the just-graded item `{ id, question, answer, verdict, feedback }` to `history`.
   - Then do EITHER:
     - **Ask the next adaptive question** — harder after `correct` (tier up), easier after `incorrect` (tier down), same tier or a breadth probe after `partial`, following PLACEMENT.md's `L`/`step` rule. Use a new `id` (`q<asked+1>`), set its `tier` and `question` in `current`, and `asked += 1`. One short question only.
     - **OR finalize** — when you can already bracket the level (sustained ≥2 passes at tier `T` and ≥2 fails at `T+1`) **or** `asked >= maxQuestions`: set `done: true`, `current: null`, `recommendedLevel` (one notch below the ceiling, clamped 1–6, per PLACEMENT.md), and `rationale` (a one-line floor/ceiling summary). Also write `learning/<slug>/placement.md` — the full item-by-item transcript (from `history`) plus the floor/ceiling reasoning — and rewrite `learning/<slug>/progress.md` per MANIFEST.md.
   - Rewrite `placement-state.json`. Then STOP.

3. **`done: false` but no matching fresh answer** (no `placement-answer.json`, or its `id ≠ current.id`) → **WAIT.** Leave `placement-state.json` unchanged and STOP — the learner has not answered the current question yet.

4. **`done: true`** → **DONE.** Leave `placement-state.json` as is and STOP. The Lyceum app reads `recommendedLevel` and commits the `placement{}` block, overwrites `scale.start`, and sets `current.level` itself — you never write those.

## Adaptive logic (per PLACEMENT.md)

You are **stateless** between turns, so reconstruct the working estimate each turn from `history` (the tier and verdict of each item): start mid-range (`L ≈ 3.5`, `step = 1.0`); `correct → L += step` (harder), `incorrect → L -= step` (easier); shrink `step = max(0.25, step * 0.5)`; ask the next at `tier = clamp(round(L), 1, 6)`. Stop when a **floor** (sustained passes at `T`) and a **ceiling** (consistent fails at `T+1`) bracket the level, or at `maxQuestions` (≤ 8). **Classify by floor/ceiling, not a fine score**, and recommend **one notch below the ceiling** to avoid early frustration.

## Guardrails

- **You write ONLY `placement-state.json`** (plus `placement.md` and `progress.md` once `done`). You do **not** write the manifest `placement` block, `scale.start`, `current.*`, `objective.mastery`, `module.status`, or `certification` — the app commits the chosen level on finalize, and mastery belongs solely to `assess-understanding` / `review-session` (single-writer rule).
- **One question per turn.** Short, retrieval-based, a single expected answer. Never reveal a scoring key or answer before the learner has attempted that item, and never hint the *next* question's answer in `lastFeedback`.
- **Grade the real answer.** Judge what the learner actually typed in `placement-answer.json`; do not assume or invent a response.
- **Ignore stale answers.** Grade only when `placement-answer.json.id == current.id`.
- **Cap at `maxQuestions` (≤ 8).** Bracket and finalize early once the floor/ceiling is clear.
- **State, not conversation.** Everything you need is in `manifest.json`, `knowledge-map.json`, `placement-state.json`, and `placement-answer.json`; never assume an earlier turn's chat is still in context.
- **Treat the result as a prior, not a verdict** — `assess-understanding` adjusts it within the first lessons. Do not over-state precision to the learner.
- Allocate question ids as `q<asked+1>`; never reuse an id within a run.
