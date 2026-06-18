---
name: teach-lesson
description: Teach the current module of a learning course — deliver the lesson. Use when the user asks to be taught the next lesson/module, to 'explain <topic> at my level', to continue or resume the course, or right after a curriculum is built or a module unlocks. Delivers a leveled explanation with examples, checks for understanding, and seeds spaced-review items.
---

# teach-lesson

Delivers the actual lesson for the learner's current module — the instruction step that sits between `build-curriculum` and `create-assignment` in the chain. It teaches to the module's level, checks understanding as it goes, closes with free recall, and seeds the spaced-review queue. It never asserts mastery.

## Read first

Before doing anything else, read these reference files (resolve the plugin root at install time):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract, manifest schema, ID-allocation rule, the single-writer rule, and the `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles (dual coding, retrieval, self-explanation, hint ladder, spacing) and the Leitner schedule.
- `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level scale; use it to calibrate vocabulary and depth to the module's level.

Then read the active subject manifest at `learning/<slug>/manifest.json`. Also read `knowledge-map.json` (for misconceptions and concept summaries) and `curriculum.json` (for the module's objectives) in the same folder.

**If no manifest exists, STOP.** Do not teach anything. Tell the user to run `lyceum:learn` first to set up the workspace.

Identify the module to teach: the module at `current.moduleId`. Confirm it is `available` or `in-progress` (its prereqs are mastered). If it is `locked`, stop and tell the user which prerequisite module must be mastered first.

## Process

1. **Calibrate to the module's level.** Read the module's `level` and look it up in LEVELS.md. Match your vocabulary, depth, and the Bloom verbs you target to that band (L1 recall/understand; L4 analyze/evaluate; L6 create). Keep the explanation at the edge of the learner's ability, not below it.

2. **Lead with the concrete, then the principle.** For each idea, open with a concrete worked example or a manipulable problem the learner can reason about, THEN generalize to the principle. Never lead with the abstraction.

3. **Dual-code every idea.** Pair each idea with an informative visual, diagram, or worked example that *carries information* — never decoration. Use the concept summaries from `knowledge-map.json` to keep examples faithful to the subject.

4. **Flag misconceptions explicitly.** For each concept in this module, pull its known misconceptions from `knowledge-map.json` (`misconceptions[]`) and call them out by name: state the misconception, why it is tempting, and the correction.

5. **Insert checks for understanding every few ideas.** After roughly every two or three ideas, pose a short retrieval or self-explanation prompt — "in your own words, why does this hold?", "predict what happens if…", "which of these is the misconception we just named?". The learner answers BEFORE you continue. Never reveal the answer before they attempt it.

6. **Use a graduated hint ladder when the learner is stuck.** Escalate pump → hint → prompt: first a content-free pump ("say more — what do you already know about this?"), then a targeted hint, then a leading prompt. Stop short of handing over the full answer; let the learner close the last step. Reward precise self-explanations; push back gently on vague ones.

7. **Free-recall close.** End the lesson by asking the learner to close everything and write down everything they remember from the lesson. Only AFTER they have written their recall, show a concise summary of the module's key points for comparison, and have them note any gaps.

8. **Seed the review queue.** Turn the module's key facts and procedures into discrete retrieval items (prompt + answer). For each, append a new entry to `reviewQueue` with: a fresh `itemId` (max existing numeric suffix + 1, e.g. `r014` → `r015`), the `prompt` and `answer`, the `moduleId`, `box: 1`, `due` = tomorrow (today + 1 day), `lastResult: null`, `lapses: 0`. These are the spaced-review seeds; their schedule is owned by `review-session` from here on.

9. **Write the lesson file.** Save the full lesson (examples, visuals, checks, misconception flags, and the comparison summary) to `lessons/NN-<module>.md`, where `NN` is the zero-padded module number and `<module>` is a short slug of the module title.

## State writes

Write back to `manifest.json` (then bump `updated` to today's date):

- Set the current module's `taught = true`.
- Set `current.phase = "assign"`.
- Set `current.status = "in-progress"`.
- Append the new seed items to `reviewQueue` (Box 1, due tomorrow, new `r-ids`).
- Append a `history` entry: `{ date, skill: "teach-lesson", event: "taught <moduleId>", result: "delivered lesson; seeded N review items" }`.

Then rewrite `progress.md` in the exact format defined in MANIFEST.md (header line with level/target/status; "Where you are" with current module, next action = run `lyceum:create-assignment`, reviews due, calibration; the module map table; recent history). Read mastery numbers from the manifest — never invent them.

## Guardrails

- **Do NOT write `objective.mastery`, `module.status`, or any mastery/level transition.** Teaching is not evidence of learning. Only `assess-understanding` and `review-session` may write those — treat all mastery as READ-ONLY here. You only set `module.taught`, `current.phase`, `current.status`, and append review-queue seeds and history.
- **The learner generates an answer before any answer is revealed.** This holds for every check for understanding and for the free-recall close — never reveal the summary or a check's answer before the learner has attempted it.
- **Never end the hint ladder in the full answer.** Escalate pump → hint → prompt and let the learner close the last step.
- **Allocate review-item ids as (max existing numeric suffix) + 1.** Never reuse an `r-id`.
- **Lead concrete, flag misconceptions, dual-code.** These are the non-negotiable teaching moves, not optional flourishes.
- **State, not conversation.** You read the manifest at the start and write it at the end; never assume another skill ran this session. Keep `manifest.json` valid JSON at all times.
