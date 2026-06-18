# LEVELS.md — the 6-level mastery scale

A fusion of CEFR's six bands, the Dreyfus skill-acquisition stages, and Bloom's revised taxonomy. These are the values of `scale.start` / `scale.target` and every `module.level`. Loaded by every skill that reasons about level (`placement-test`, `build-curriculum`, `teach-lesson`, `create-assignment`, `assess-understanding`, `capstone`).

**Design logic in one line:** as levels rise, Bloom's center of gravity moves up (Remember → Create), Dreyfus's mode shifts from rule-following to intuition, scaffolding fades from "I do" to "you do alone," and SOLO understanding moves from unistructural to extended-abstract.

| L | Name | CEFR / Dreyfus | Dominant Bloom | The learner can… | Mastery is shown by… |
|---|---|---|---|---|---|
| **1** | **Aware** | A1 / Novice | Remember → Understand | recall key terms and follow step-by-step rules on simple, familiar tasks with scaffolding | ~90% recall of core facts + executing a guided procedure |
| **2** | **Functional** | A2 / Advanced Beginner | Understand → Apply (routine) | explain core concepts and run routine procedures using rules of thumb | solving routine problems with minimal hints |
| **3** | **Competent** | B1 / Competent | Apply → Analyze | work unsupervised on familiar tasks, plan a multi-step approach, troubleshoot | completing authentic tasks independently and justifying the approach |
| **4** | **Proficient** | B2 / Proficient | Analyze → Evaluate | handle complex, non-standard problems; see the whole; weigh trade-offs | sound judgment on novel problems; critiquing alternatives against criteria |
| **5** | **Expert** | C1 / Expert | Evaluate → Create | perform fluently and intuitively; produce original, field-quality work | original output an expert would respect; can evaluate others' work |
| **6** | **Master** | C2 / Mastery | Create (+ Evaluate) | extend the practice itself; invent methods; teach the field | field-recognized contribution and the ability to teach it |

The scale does double duty: it sets **curriculum scope** (`build-curriculum` only generates modules within `[start, target]`) and it tags **assignment difficulty** (ASSIGNMENTS.md maps task types to levels). Advancement between levels requires demonstrating the *next* level's behaviors, not just finishing the current level's modules.

---

## Bloom verb bank (use level-appropriate verbs in objectives)

Objectives are written as **`<action verb> + <object> + <standard/condition>`**, with the verb matching the level band:

| Bloom level | Typical levels | Representative verbs |
|---|---|---|
| Remember | L1 | define, list, identify, recall, name, state, label, recognize |
| Understand | L1–L2 | explain, summarize, classify, interpret, paraphrase, compare, exemplify |
| Apply | L2–L3 | apply, calculate, demonstrate, execute, implement, solve, use, perform |
| Analyze | L3–L4 | differentiate, contrast, deduce, distinguish, categorize, infer, organize |
| Evaluate | L4–L5 | appraise, argue, assess, critique, defend, justify, prioritize, judge |
| Create | L5–L6 | design, construct, develop, formulate, compose, invent, hypothesize, devise |

---

## Per-level mastery thresholds (the advancement gate)

A module is `mastered` only when its objectives clear the module's `masteryThreshold`. Set the threshold **by level**, because the *evidence type* differs by level (recall percentages at the bottom, rubric judgments at the top):

| Module level | `masteryThreshold` | How the gate is judged |
|---|---|---|
| **L1–L2** | **0.90** | ~90% on low-stakes recall / routine-procedure checks (fresh items each attempt) |
| **L3** | **0.85** | authentic performance task completed independently and accurately; approach justified |
| **L4–L6** | **0.85 (rubric-referenced)** | store ~0.85 numerically, but the real gate is the analytic rubric: **no dimension below Proficient** for the level; higher levels require Advanced-band evidence (see ASSIGNMENTS.md and the capstone rubric) |

Rules `assess-understanding` enforces:
- Map rubric bands to mastery: all-Proficient ≈ **0.85**, all-Advanced ≈ **1.0**, anything below Proficient < **0.7**.
- Use **fresh / parallel items** on each re-attempt so the learner can't memorize the test.
- Advancement from level *N* to *N+1* requires **all level-N modules mastered** *and* evidence of the next level's behaviors (a synthesis/transfer task), not just isolated module scores.
- Keep tasks inside the **ZPD** — challenging but achievable with current scaffolding — and **fade hints** as mastery is shown.
