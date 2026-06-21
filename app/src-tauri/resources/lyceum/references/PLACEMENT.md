# PLACEMENT.md — placement-test blueprint

Loaded by `placement-test`. The goal is **classification into a level**, not a precise score — find the learner's **floor** (sustained success) and **ceiling** (consistent breakdown). This is a classification test, not a fine-grained measurement.

Placement is **interactive and turn-by-turn**: you ask one adaptive question, the learner answers it in the app, you grade *that* answer and ask the next. You decide the level yourself from the answers — there is no separate self-grade.

---

## Turn-per-exchange model

Each turn you run, you do exactly ONE thing, choosing your mode from the files in `learning/<slug>/`:

- **`placement-state.json`** — yours; the running state (questions asked, `history`, the `current` question, `done`/`recommendedLevel`). You rewrite it every turn.
- **`placement-answer.json`** — the app writes the learner's latest typed answer as `{ id, answer }`. Grade it only when `id == current.id`.

Modes: **open** (no state → ask the first question), **grade + ask** (a fresh matching answer → grade it, then ask the next *or* finalize), **wait** (no fresh answer → leave state untouched), **done** (already finalized → no-op; the app commits the level). The full per-mode contract lives in the `placement-test` SKILL.

You are **stateless between turns** — reconstruct everything you need from `manifest.json`, `knowledge-map.json`, and `placement-state.json.history`.

---

## Item selection

Draw each question from `knowledge-map.json`, one at a time, at the tier the adaptive rule asks for. Keep each question **short, retrieval-based, with a single expected answer** (the learner produces an answer before anything is revealed). Favor recall / short-answer at lower tiers; add a short **reasoning** probe at the higher tiers (3+).

An item at tier *d* is one a learner *at level d* gets right ~50–60% of the time; a learner above it usually passes, below it usually fails. There is no pre-built pool — you compose the next question live from the verdicts so far.

---

## Adaptive logic (rule-based — ship this for v1)

```
L = 3.5                              # working level estimate; start mid-range
step = 1.0
ask one question at tier round(L)
for each subsequent question (up to maxQuestions = 8):
    grade the learner's typed answer -> verdict in {correct, partial, incorrect}
    if correct:   L = L + step       # go harder
    if incorrect: L = L - step       # go easier
    if partial:   keep L (probe breadth at the same tier)
    step = max(0.25, step * 0.5)     # shrink: 1.0 -> 0.5 -> 0.25
    ask the next question at tier = clamp(round(L), 1, 6)
    if passed >=2 at tier T and failed >=2 at tier T+1:
        floor = T; ceiling = T+1; finalize
```

Because you are stateless, recompute `L` and `step` each turn by replaying `history` (tier + verdict per item). Never reveal a scoring key or the answer before the learner has attempted that item, and never hint the next question's answer in `lastFeedback`. Stop once a floor and ceiling bracket the level, or at `maxQuestions` (≤ 8).

---

## Score → starting level

Classify by floor/ceiling (not a fine score). **Recommend starting one notch below the ceiling** to avoid early frustration.

| Outcome after the adaptive run | Start at |
|---|---|
| Fails most tier-1 items | Level 1 |
| Sustains tier 1, breaks at tier 2 | Level 2 |
| Sustains tier 2, breaks at tier 3 | Level 3 |
| Sustains tier 3, breaks at tier 4 | Level 4 |
| Sustains tier 4, breaks at tier 5 | Level 5 |
| Passes the hardest (tier 5–6) items | Level 6 → route toward capstone/portfolio |

Write the recommendation into `placement-state.json` as `recommendedLevel` with a one-line `rationale`. Clamp to 1–6.

---

## After the test (when you set `done: true`)

- Write `placement.md` — the full item-by-item transcript (from `history`) plus the floor/ceiling reasoning — and rewrite `progress.md` per MANIFEST.md.
- Set `placement-state.json` to `{ done: true, current: null, recommendedLevel, rationale, … }`.
- **Do NOT** write the manifest `placement` block, `scale.start`, or `current.level` — the **Lyceum app** reads `recommendedLevel` and commits those on finalize (placement stays app-writable; you never assert mastery). Treat the result as a **prior, not a verdict** — `assess-understanding` adjusts it within the first lessons.

Upgrade to IRT-calibrated difficulties only once a large response history exists; expert-assigned tiers are fine to start.
