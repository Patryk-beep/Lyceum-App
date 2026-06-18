# PLACEMENT.md — placement-test blueprint

Loaded by `placement-test`. The goal is **classification into a level**, not a precise score — find the learner's **floor** (sustained success) and **ceiling** (consistent breakdown). This is a computerized *classification* test, not a fine-grained measurement.

---

## Item pool

From `knowledge-map.json`, build a small pool spanning tiers 1–6 (a few items per tier). Tag each item with its **tier** (1–6) and a **scoring key**. Mostly quick **recall / short-answer** items; add one or two short **reasoning** probes at the higher tiers (3+). Mix item types (a fast check plus a reasoning probe) but keep every item retrieval-based — the learner produces the answer **before** anything is revealed.

An item at tier *d* is one a learner *at level d* gets right ~50–60% of the time; a learner above it usually passes, below it usually fails.

---

## Adaptive logic (rule-based — ship this for v1)

```
L = 3.5                              # working level estimate; start mid-range
step = 1.0
ask one item at tier round(L)
for each subsequent item (up to 10):
    if last answer correct: L = L + step      # go harder
    else:                   L = L - step      # go easier
    step = max(0.25, step * 0.5)              # shrink: 1.0 → 0.5 → 0.25
    ask next item at tier = clamp(round(L), 1, 6)
    if passed ≥2 at tier T and failed ≥2 at tier T+1:
        floor = T; ceiling = T+1; stop early
```

Ask the learner's answer **before** revealing anything. Optionally ask a confidence rating (1–5) to seed calibration. Stop once a floor and ceiling bracket the level, or at 10 items.

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

**Non-adaptive fallback** (fixed 10-item form, ~1–2 items per tier): start the learner one level above the highest tier where they scored ≥70%, but never above a tier where they dropped below 50%.

---

## After the test

- Write `placement.md` (full transcript + reasoning).
- Write the `placement` block: `{ taken: true, date, recommendedLevel, evidence }`.
- **Overwrite `scale.start`** with the recommended integer (the router keys off `placement.taken`, not the `"test"` sentinel) and set `current.level` to the same value.
- Treat the result as a **prior, not a verdict** — `assess-understanding` adjusts it within the first lessons.

Upgrade to IRT-calibrated difficulties only once a large response history exists; expert-assigned tiers are fine to start.
