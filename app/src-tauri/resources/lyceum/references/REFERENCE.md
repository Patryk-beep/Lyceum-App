# REFERENCE.md — the pedagogical foundation

**Every Lyceum skill loads this file** so the whole chain pulls in the same direction. Each point is an evidence-based *rule the skills act on*; the research behind it is in the three reports bundled with the system (`research/learning-techniques.md`, `research/assessment-assignments.md`, `research/curriculum-design.md`).

---

## The ten principles every skill obeys

1. **Retrieval practice is the unit of learning.** Recalling from memory beats rereading — the strongest single technique (Roediger & Karpicke 2006; Dunlosky 2013 rates it top-tier). **Rule:** lessons end in free recall, reviews are quizzes, and the learner **always generates an answer before any answer is revealed**. Prefer free/short recall over multiple-choice (recognition leaks the answer).

2. **Space it, never "finish" it.** Distributed practice beats massed (Hattie d≈0.71; Cepeda 2008). **Rule:** completing a lesson *schedules future reviews* (§ schedule below); nothing is ever marked done-forever.

3. **Interleave.** Mixing problem types forces the learner to *choose* the method — the skill that transfers (Rohrer 2020). **Rule:** problem sets and reviews mix types; only the **first** exposure to a confusable skill is blocked, then interleave.

4. **Make them explain.** Self-explanation / elaborative interrogation (g≈0.55). **Rule:** after worked examples, prompt "why does this step work?" and "how does this connect to what you already know?" Reward *precise* self-explanations; vague ones carry little benefit.

5. **Dual-code, concretely.** Pair words with *informative* visuals and lead abstractions with concrete examples (Paivio; Brilliant's "problem first"). **Rule:** every concept gets a worked example or diagram that carries information — never decoration. Lead with a concrete, manipulable example, *then* generalize.

6. **Deliberate practice for skills.** Target specific weak sub-skills at the edge of ability with immediate feedback (Ericsson; Hattie feedback d≈0.73). **Rule:** `assess-understanding` diagnoses the weak objective and `create-assignment` drills *that*, not generic review.

7. **Desirable difficulty.** Optimize for *delayed* retention, not in-session ease (Bjork). **Rule:** expect good practice to feel effortful; treat a smooth, fast, error-free session as a signal to **raise** difficulty, not as success.

8. **Calibrate against reality.** Fluency creates an illusion of competence; learners misjudge what they know (Koriat & Bjork 2006). **Rule:** before revealing a quiz answer, ask the learner to predict correct/incorrect (or confidence 1–5); track predicted-vs-actual as a calibration score. **Measured performance, not the learner's feeling, drives mastery and scheduling.**

9. **Feedback that teaches (Hattie/Timperley + Shute).** **Rule:** every piece of feedback answers **Feed-Up** ("where are you going" — the standard), **Feed-Back** ("how are you going" — the specific gap vs. the standard, aimed at the *process*, not the person), and **Feed-Forward** ("where next" — one or two concrete steps). Give **comments, not bare grades**; if a score is shown, de-emphasize it and keep it separate from the comment (the grade crowds out the comment — Wiliam). Never reveal the answer before an attempt. Immediate feedback for hard/new material; delayed for easy/consolidated material.

10. **Mastery gating (backward design).** Define what target-level performance looks like first, then teach toward it (Wiggins & McTighe). **Rule:** a learner advances a module only when its objectives clear the `masteryThreshold` (see LEVELS.md for per-level values); otherwise remediate. Mastery learning adds ≈1σ; tutoring-style adaptivity approaches ≈2σ (Bloom 1984, with VanLehn's realistic d≈0.76 caveat).

---

## Spaced-repetition schedule (ship this exactly)

Default to a transparent **Leitner ladder**; upgrade to FSRS once real review history exists.

| Box | Review interval | Meaning |
|---|---|---|
| 1 | 1 day | new, or just failed |
| 2 | 3 days | |
| 3 | 7 days | |
| 4 | 16 days | |
| 5 | 35 days | well-learned |
| 6 | 90 days (then retire/maintain) | durable |

**Rules:** a correct recall **promotes** the item one box; **any miss resets it to Box 1** (the failure is the signal). Set the ladder length to the goal horizon — compress for a near deadline (first gap ≈10–20% of the retention target, per Cepeda), let it expand for durable skills. When enough review outcomes are logged, migrate to **FSRS** with `desiredRetention = 0.90` (range 0.80–0.95) and short same-day learning steps; expose only the retention dial to the learner.

**Computing `due`:** `due = today + interval(box)`. On a pass, set `box = min(box+1, 6)` (a Box-6 pass → `box = "retired"`, stop recycling) and recompute `due`. On a miss, set `box = 1`, `due = tomorrow`, increment `lapses`.

---

## Productive failure needs consolidation (do not skip)

Struggle-first ("productive-failure") tasks — where the learner attempts a hard-but-accessible problem **before** instruction — only work when the struggle is followed by **explicit consolidation** of the expert solution (Kapur). It is *not* discovery learning and it **fails without the consolidation phase**. **Rule:** whenever a productive-failure task is assigned, `assess-understanding` (or the lesson that follows) **must** deliver the structured consolidation — compare the learner's attempt to the canonical approach, name the gap, and teach the principle the struggle exposed. Expect a weak *first* attempt; the gain shows up on delayed conceptual and transfer items, so do not penalize the initial struggle as failure.

---

## Anti-patterns (the skills must NOT do these)

- Rereading and highlighting as "study" (low utility, illusion of competence) — never make "read it again" a review action.
- Acting on the learner's immediate confidence ("do you feel you know it?") — use test performance and delayed judgments instead.
- Cramming-as-completion — never let "finish a topic in one sitting" be the success state.
- Recognition-only multiple choice that leaks the answer — prefer free/short recall; if MCQ, use plausible distractors and require justification.
- Hint ladders that always end in the full answer (learners game them) — escalate **pump → hint → prompt** and stop short of handing over the answer.
- Praising the person rather than the work — keep feedback task/process-focused; use praise sparingly.
- Showing a bare grade next to feedback — the grade crowds out the comment (Wiliam).
