---
name: learn
description: Start, resume, or navigate a structured learning course on any subject. Use whenever the user says they want to learn, study, get good at, or be taught something (e.g. 'teach me X', 'I want to learn Spanish', 'help me study organic chemistry'), wants to resume a course, or asks 'what's next' in a subject they're studying. Sets up the learner workspace and routes to the right step. Trigger this for any open-ended 'help me learn X' request even if no specific skill is named.
---

# learn

The orchestrator and entry point for the Lyceum chain. It sets up a subject's learner workspace, captures the two course variables (start and target level), and routes to the correct next skill based on on-disk state. This is the ONLY skill that creates the manifest; every other skill in the chain reads it.

## Read first

Before doing anything, read these reference files (they define the contracts you must honor):

- `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the `manifest.json` schema, the workspace layout, the two contracts, the id-allocation rule, and the exact `progress.md` format.
- `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles every skill obeys.

Then look for the active subject manifest at `learning/<slug>/manifest.json`.

UNLIKE every other Lyceum skill, `learn` does NOT stop when no manifest exists — creating it is this skill's job. If a matching subject already exists, read its manifest and resume at the router. If none exists, create a new subject (see Process). When you show the target-level table to the user, read `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` for the 6-level scale.

## Process

### Resolve the subject

1. Inspect the `learning/` directory for an existing subject slug that matches what the user wants to learn. If a match is found, read its `manifest.json` and skip directly to **ROUTER** (step 7) to resume — do NOT re-ask the setup questions.
2. If no matching subject exists, create a new one. Ask the user for exactly THREE things and nothing else:
   - (a) the **subject**, as specifically as they can state it;
   - (b) the **target level**, 1–6 (show the LEVELS.md table so they can choose);
   - (c) the **starting point**: a level 1–6, OR the word `test` to be placed by a short adaptive test.
   Defaults if the user is unsure: start = `test`, target = `4`. Do not ask anything else.
3. Slugify the subject (lowercase, hyphenated, no spaces or punctuation).
4. Create the directory `learning/<slug>/`.
5. Write an initial `manifest.json` containing:
   - `subject`, `slug`, `created` (today), `updated` (today);
   - `scale`: `{ "start": <integer 1–6 or "test">, "target": <integer 1–6> }`;
   - `settings`: `{ "scheduler": "leitner", "retentionTarget": 0.90, "sessionLengthMin": 30, "htmlTheme": "default" }`. **Personal default:** before using these neutral defaults, check for an optional preferences file at the user's home `~/.claude/lyceum.local.json`; if it exists, seed `settings` from it (e.g. take its `htmlTheme`). If it is absent — the normal case for anyone you share the plugin with — use the neutral defaults shown. This keeps the *shipped* default neutral while honoring a per-user default.
   - `current`: `{ "level": <start if numeric, else null>, "moduleId": null, "phase": null, "status": "not-started" }`;
   - empty/null placeholders for the remaining schema fields (`placement: null`, `modules: []`, `assignments: []`, `reviewQueue: []`, `calibration: { predictions: 0, hits: 0, log: [] }`, `certification: null`, `history: []`).
   Confirm it is valid JSON.
6. Create `progress.md` in the MANIFEST.md format.

### ROUTER

7. Compute the next step from state. **FIRST MATCH WINS**, in this EXACT order:
   - (i) no `research.md` exists → route to **research-topic**.
   - (ii) `placement.taken != true` AND `scale.start == "test"` → route to **placement-test**.
   - (iii) no `curriculum.json` exists → route to **build-curriculum**.
   - (iv) the current module (`current.moduleId`) has `taught != true` → route to **teach-lesson**.
   - (v) the current module is taught AND has no `open` or `submitted` assignment in `assignments[]` for it → route to **create-assignment**. (A module whose only assignment is already `graded` — e.g. during remediation — lands here and gets its next drill.)
   - (vi) the current module has an assignment with `status == "open"` (created, not yet submitted) → tell the learner to **complete that open assignment now**; show its file path (`assignments/<file>`). Do NOT create a duplicate assignment.
   - (vii) any assignment has `status == "submitted"` → route to **assess-understanding**.
   - (viii) all modules up through `scale.target` are `mastered` → route to **capstone**.
   - (ix) `current.status == "certified"` → report that the course is complete.
8. Use `current.phase` as the tiebreaker when files alone are ambiguous. For example, `phase == "remediate"` re-enters **teach-lesson** (re-teach) or **create-assignment** (targeted drill) on the weak objective rather than advancing.
9. **Reviews are orthogonal.** Independently of the computed primary step, scan `reviewQueue`: if any item has `due <= today`, ALSO surface "N reviews due — run `lyceum:review-session`" ALONGSIDE the primary step (not instead of it).
10. Act on the routing decision: either invoke the next skill directly, or tell the learner the single command to run next and clearly explain WHY (what state condition triggered it). Surface the reviews line too when applicable.

### Finish

11. Update `progress.md` (rewrite it in the MANIFEST.md format) and bump `manifest.updated` to today. Append a one-line entry to `history`.

## State writes

`learn` writes:

- On a NEW subject: it CREATES `manifest.json` with `subject`, `slug`, `created`, `updated`, `scale`, `settings`, and the initial `current` block plus empty schema placeholders; and creates `learning/<slug>/` and `progress.md`.
- On every invocation (new or resume): bump `manifest.updated` to today and append a one-line `history` entry recording the routing decision.
- Rewrite `progress.md` in the exact dashboard format defined in MANIFEST.md (header line, "Where you are", module map table, recent history), reading mastery numbers from the manifest — never inventing them.

`learn` NEVER writes `objective.mastery` or a module's `mastered` status (single-writer rule). It DOES initialize the `current` navigation block when creating a subject and appends `history` when routing — but it never asserts mastery. On resume it only reads `current` and the on-disk files to route.

## Guardrails

- This is the only skill that creates the manifest — so it does NOT stop when the manifest is missing. Every OTHER skill does stop.
- Ask the user exactly THREE setup questions (subject, target, start) and nothing more. Honor the defaults (start = `test`, target = `4`) when the user is unsure.
- Routing is computed from disk, never from conversation memory. Never assume another skill ran this session.
- FIRST MATCH WINS in the router — evaluate conditions (i)–(ix) in order and stop at the first that holds.
- Branch (vi) closes a routing dead-end: when an assignment is `open`, point the learner at it; never create a duplicate assignment.
- Reviews are orthogonal — surface due reviews ALONGSIDE the primary step, never as a replacement for it.
- Treat `objective.mastery` and any module's `mastered` status as READ-ONLY. `learn` only initializes/updates the `current` navigation block; it never asserts mastery.
- Allocate any new ids as (max existing numeric suffix) + 1; never reuse an id.
- Keep `manifest.json` valid JSON at all times and bump `updated` whenever you write it.
