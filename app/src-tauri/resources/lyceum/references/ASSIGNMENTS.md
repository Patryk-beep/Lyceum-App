# ASSIGNMENTS.md — assignment-type catalog

`create-assignment` picks from this catalog. Each type is tagged by the levels it best serves. Lower-level types build and check fluency; higher-level types demonstrate transfer and mastery.

| Task type | Best for (purpose) | Levels |
|---|---|---|
| Short / free-recall question | retrieval; comprehension; exposes reasoning (preferred over MCQ) | 1–4 |
| Multiple-choice check (plausible distractors, justify the choice) | fast formative check, placement | 1–3 |
| Flashcard / spaced-recall set | durable retention of facts & procedures | 1–4 |
| Worked example + faded steps | acquisition; lowers cognitive load for novices | 1–2 |
| Guided practice with hint ladder | skill-building with scaffolding (inner-loop tutoring) | 2–4 |
| Deliberate-practice drill (targets a weak sub-skill) | improvement at the edge of ability | 2–5 |
| Productive-failure problem (struggle before instruction) | activate prior knowledge; **requires consolidation after** | 3–5 |
| Feynman "explain it simply" | self-explanation; surfaces gaps | 2–6 |
| Teach-it / protégé task (teach a novice) | deep consolidation; learning by teaching | 3–6 |
| Performance task (authentic mini-deliverable) | application & transfer; produce real work | 3–5 |
| Problem-based scenario (ill-structured) | reasoning + self-directed learning | 4–6 |
| Project (gold-standard PBL, public product) | integration + success skills | 4–6 |
| Interleaved mastery challenge (mixed prior skills) | spaced, mixed review | 2–5 |
| Capstone / portfolio | demonstrate integrated mastery (see `capstone`) | 5–6 |

**Default policy:** at L1–2 lean on recall, worked examples, and guided practice; at L3–4 shift to performance tasks and productive failure; at L5–6 use projects, problem-based scenarios, and teaching tasks. **Always interleave** (mix types; once prior modules exist, fold in one or two items from earlier material) and **always withhold answers until an attempt**.

---

## The single-point analytic rubric (attach to every brief)

Write one **single-point rubric**: describe only the **Proficient ("meets the standard")** column for each dimension, leaving open space for the grader to note where the work fell **below** and **above**. It concentrates feedback on *gap vs. standard* and *next step*. Use these generic, domain-agnostic dimensions (rename/specialize per task):

- **Correctness / accuracy** — Proficient: correct, meets the standard.
- **Reasoning / process** — Proficient: sound, complete reasoning; choices justified.
- **Conceptual understanding** — Proficient: explains the *why*; connects ideas.
- **Communication / clarity** — Proficient: clear and well-organized.

`assess-understanding` scores each dimension on the 4-band scale (Beginning / Developing / Proficient / Advanced) under the hood and delivers single-point comments.

---

## Productive-failure tasks: the mandatory two phases

A productive-failure task is **only half an assignment**. It has two required phases:
1. **Generation/struggle** — the learner attempts a hard-but-accessible problem **before** instruction. Expect a weak first attempt; that is the design, not a failure.
2. **Consolidation** — immediately afterward, the canonical/expert solution is taught against the learner's attempt: name what they tried, where it broke, and the principle the struggle exposed.

When `create-assignment` issues a productive-failure problem, it **must** flag in the brief (and in the `assignments[]` entry note) that a consolidation step is owed, so `assess-understanding` delivers it and never leaves the struggle un-consolidated. Skipping consolidation makes the technique backfire (Kapur) — see REFERENCE.md.

---

## Calibrate difficulty (desirable difficulty + ZPD)

Aim every task at the **edge of current ability**: effortful but achievable with current scaffolding. If the learner is sailing through, raise difficulty (smooth ≠ success). If they can't get traction even with hints, drop back a notch. Withhold the answer key from the learner's view — hold it for `assess-understanding`.
