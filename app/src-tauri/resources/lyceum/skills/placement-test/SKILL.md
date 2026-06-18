---
name: placement-test
description: Assess a learner's current level in a subject with a short adaptive test, then recommend where to start. Use when the user says 'test my skills/level', 'where should I start', 'how much do I already know', when placement is requested, or whenever the course's start is set to 'test'. Produces a recommended starting level 1-6.
---

# placement-test

Decide where the learner should start, in ~10 adaptive questions. Runs after `research-topic` (it needs the knowledge map) and before `build-curriculum`; the router reaches it when `scale.start == "test"` and `placement.taken != true`.

## Read first

Read these reference files before doing anything (paths resolve once the plugin is installed):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, schema, and `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles (retrieval over recognition, calibration).
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale you are classifying into.
- `${CLAUDE_PLUGIN_ROOT}/references/PLACEMENT.md` — the adaptive logic and floor/ceiling → level table. **This is the authoritative blueprint; follow it exactly.**

Then read the active subject manifest at `learning/<slug>/manifest.json`. **If no manifest exists, STOP** and tell the user to run `lyceum:learn` first — this skill does not create the workspace. Also confirm `knowledge-map.json` exists in the same folder; if it is missing, STOP and tell the user to run `lyceum:research-topic` first (the item pool is built from it).

## Process

1. **Build the item pool from `knowledge-map.json`.** Span tiers 1–6 with a few items per tier. Make most items quick **recall / short-answer**; add one or two short **reasoning** probes at the higher tiers (3+). Tag each item with its `tier` (1–6) and a `scoring key`. Keep every item retrieval-based — the learner produces an answer before anything is revealed. (An item at tier *d* is one a learner at level *d* passes ~50–60% of the time.)

2. **Run adaptively per PLACEMENT.md.** Start at tier 3–4 (working estimate `L = 3.5`, `step = 1.0`):
   - Ask one item at `tier = round(L)`. Ask for the learner's answer **before revealing anything**. Optionally ask a confidence rating (1–5) to seed calibration.
   - Judge pass/fail against the scoring key, then reveal.
   - On a **correct** answer go harder (`L = L + step`); on a **wrong** answer go easier (`L = L - step`).
   - Shrink the step each item: `step = max(0.25, step * 0.5)` (1.0 → 0.5 → 0.25).
   - Ask the next item at `tier = clamp(round(L), 1, 6)`.

3. **Stop** as soon as a **floor** and **ceiling** bracket the level — i.e. `passed ≥2 at tier T` and `failed ≥2 at tier T+1` (then `floor = T`, `ceiling = T+1`) — or at **10 items**, whichever comes first. (Non-adaptive fallback in PLACEMENT.md if you must use a fixed 10-item form.)

4. **Classify by floor/ceiling, not a fine score**, using the PLACEMENT.md table (fails most tier-1 → L1; sustains tier 1 breaks at 2 → L2; … passes hardest tier 5–6 → L6). **Recommend starting one notch below the ceiling** to avoid early frustration. Clamp the recommendation to 1–6.

5. **Write outputs** (see State writes): `placement.md` (full transcript + reasoning), the `placement` block, overwrite `scale.start`, set `current.level`, bump `updated`, and rewrite `progress.md`.

6. **Report** the recommended starting level and the one-line evidence to the user, and point them at the next step (`lyceum:build-curriculum`). Frame the result as a starting prior, not a final verdict.

## State writes

Write back to `learning/<slug>/manifest.json`:

- `placement` block: `{ "taken": true, "date": "<today>", "recommendedLevel": <int 1–6>, "evidence": "<floor/ceiling summary, e.g. 'floor at L2 (sustained), ceiling at L3 (broke on subjunctive)'>" }`.
- **Overwrite `scale.start`** with the recommended integer (the router keys off `placement.taken`, not the `"test"` sentinel, so downstream skills always read a number).
- Set `current.level` to the same recommended integer.
- Append a `history` entry: `{ date, skill: "placement-test", event, result }`.
- If the learner gave confidence ratings, update `calibration` (predictions/hits/log) from predicted-vs-actual.
- Bump `updated` to today's date.

Also write `learning/<slug>/placement.md` (full item-by-item transcript, each answer judged pass/fail, and the floor/ceiling reasoning) and rewrite `learning/<slug>/progress.md` in the format defined in MANIFEST.md.

Do **not** write `objective.mastery` or any `module.status` — those are read-only here (single-writer rule).

## Guardrails

- **Never reveal an answer, scoring key, or answer-key before the learner has attempted that item.** The learner always generates an answer first.
- **Classify, don't measure.** Decide by floor and ceiling per PLACEMENT.md, not by a fine-grained percentage; recommend one notch below the ceiling.
- **Mastery is read-only.** Only `assess-understanding` and `review-session` write `objective.mastery` and module/level status. This skill never touches them.
- **Treat the result as a prior, not a verdict** — `assess-understanding` adjusts it within the first lessons. Do not over-state precision to the learner.
- **State, not conversation.** Read `manifest.json` first; if it is missing, stop and send the user to `lyceum:learn`. Write the manifest last and bump `updated`. Never assume another skill ran this session.
- Allocate any new ids as (max existing numeric suffix) + 1; never reuse an id.
- Cap the test at 10 items; prefer free/short recall over recognition-only multiple choice (it leaks the answer).
