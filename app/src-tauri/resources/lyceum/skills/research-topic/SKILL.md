---
name: research-topic
description: Research a subject deeply to prepare to teach it — the first step in building a course. Use when starting a new learning subject, or when the user asks to research/gather background on a topic so a curriculum can be built. Produces a structured knowledge map (concepts, prerequisites, misconceptions, level descriptors, authentic tasks). Prefer this over generic web research whenever the goal is to learn or teach the subject.
---

# research-topic

Deep, multi-source research that produces a *teachable* knowledge map — not just notes. This is the first build step in the Lyceum chain: `learn` → **research-topic** → (`placement-test`) → `build-curriculum`. Its outputs (`knowledge-map.json`) are the contract `build-curriculum` parses to design the course.

## Read first

Before doing anything, read these reference files (resolve them via the plugin root):

1. `${CLAUDE_PLUGIN_ROOT}/references/MANIFEST.md` — the state contract: `manifest.json` schema, the read-first/write-last rule, the single-writer-for-mastery rule, ID allocation, and the `progress.md` format.
2. `${CLAUDE_PLUGIN_ROOT}/references/REFERENCE.md` — the ten pedagogical principles every skill obeys (so the research you gather feeds backward design and dual coding downstream).
3. `${CLAUDE_PLUGIN_ROOT}/references/LEVELS.md` — the 6-level mastery scale. You will use this to write the six `levelDescriptors` accurately for THIS subject.

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists, **STOP** and tell the user to run `lyceum:learn` first — `learn` creates the workspace and captures the subject and target. Do not invent a manifest here.

From the manifest, read `subject` (what to research) and `settings.htmlTheme` (for the optional HTML render).

## Process

1. **Plan the research.** Identify the subject from `manifest.subject`. You are building a map a curriculum designer can teach from. Decompose the subject into these seven research facets, which you will research independently and then synthesize: (a) **structure of the field** — how the discipline is organized, its major branches and how they relate; (b) **core concepts and sub-skills** — the load-bearing ideas and capabilities a learner must acquire; (c) **prerequisite relationships** — what must be understood before what (the dependency graph among concepts); (d) **common misconceptions** — where beginners predictably go wrong and get stuck, and the corrections; (e) **level descriptors** — what competence looks like at each of the 6 levels, framed by LEVELS.md (CEFR/Dreyfus mode, dominant Bloom verbs, fading scaffolding) and specific to THIS subject; (f) **authentic tasks** — the real tasks practitioners actually perform, tagged by level; (g) **canonical resources** — primary, authoritative learning materials. These seven facets are the unit of parallel research below and map directly onto the knowledge-map contract.

2. **Run the research as a dynamic Workflow (preferred), with an automatic fallback.** This skill's instruction to use the Workflow tool is itself the explicit opt-in; you are authorized to invoke it. Attempt to run a dynamic Workflow that fans out **parallel per-facet research agents** — one agent per facet from step 1 — using `parallel()` over `agent(prompt, { schema })`. Each agent researches its facet across **at least three independent, authoritative/primary sources** and returns structured output in which **every load-bearing claim carries the URL it came from**. After fan-out, run an **adversarial verification phase**: a verifier agent (or `pipeline()` stage) re-checks each load-bearing claim against the cited sources and against at least one *independent* source — keeping a claim only if it is corroborated, and where sources conflict, recording the conflict and preferring the more authoritative/primary source. Finally a **synthesis phase** merges the verified facets into `research.md` and the five-key `knowledge-map.json` (see steps 3–4). Sketch the Workflow as: `meta = { name, description, phases }`; `phase("fan-out")` → `parallel([...per-facet agents...])`; `phase("verify")` → adversarial cross-check of all claims; `phase("synthesize")` → emit the two artifacts; use `log()` for progress.

   **If the Workflow tool is unavailable, not registered, refuses, errors, or returns no usable structured output, do NOT stop and do NOT ask the user.** Silently fall back to the **deterministic sequential procedure**: research each of the seven facets in turn using `WebSearch` and `WebFetch` across **at least three independent sources per facet**, adversarially cross-checking every load-bearing claim across sources (keep only corroborated claims; note and resolve conflicts toward the more authoritative source; attach a URL to every claim), then synthesize the same two artifacts. **The fallback is the floor, not a downgrade** — identical min-3-sources, cross-checking, citation discipline, and 5-key contract. The only difference between the two paths is orchestration (parallel fan-out vs. sequential); the outputs and the quality bar are the same. Whichever path runs, the run must always terminate with valid `research.md` and `knowledge-map.json`.

3. **Write `research.md`** at `learning/<slug>/research.md` — a readable briefing organized by the seven facets from step 1, with **every claim cited (URL)**. This is for the human (and you) to read; keep it clear and well-structured. While gathering, note any diagrams, worked examples, or concrete illustrations that `teach-lesson` could reuse (dual coding) and reference them here.

4. **Write `knowledge-map.json`** at `learning/<slug>/knowledge-map.json` — the machine contract for the curriculum. Use EXACTLY these keys:
   - `concepts`: array of `{ id, name, summary, entryLevel (1–6), prereqs: [ids] }`. Allocate concept ids consistently (e.g. `c01`, `c02`, …) using max-suffix + 1; every id in a `prereqs` array must reference a real concept id. `entryLevel` is the level at which the concept first appears.
   - `misconceptions`: array of `{ concept, misconception, correction }` — where beginners go wrong and how to fix it.
   - `levelDescriptors`: an object keyed `"1"` through `"6"`, each value describing what mastery looks like **in THIS subject** at that level. Write all six using LEVELS.md (CEFR/Dreyfus mode, dominant Bloom verbs, fading scaffolding) so they are subject-specific, not generic restatements of the scale.
   - `authenticTasks`: array of `{ level, task }` — the real tasks practitioners perform, tagged by level. These feed assignments and the capstone, so make them concrete and doable.
   - `resources`: array of `{ title, url, note }` — canonical learning resources, each with a one-line note on what it is good for.

   Validate that the JSON is well-formed and contains all five keys before saving.

5. **Optionally render `research.html`** at `learning/<slug>/research.html` for comfortable reading. Read `${CLAUDE_PLUGIN_ROOT}/references/THEMES.md` for the palette tokens; keep all colors in one small theme block (CSS variables) so it is themeable, and use the palette named by `settings.htmlTheme`, falling back to the neutral `default` palette. Keep the **shipped default neutral** for portability.

6. **Update state (see State writes below)** and tell the user what is next: if `scale.start == "test"` run `lyceum:placement-test`, otherwise run `lyceum:build-curriculum`.

## State writes

Write these back to `learning/<slug>/manifest.json` (read it, act, write it last):

- Set `current.phase` so the router continues correctly: set it to `"test"`-routing readiness — concretely, leave routing keyed off files/placement as `learn` expects. After research, the next step is placement (if `scale.start == "test"` and `placement.taken != true`) or `build-curriculum`. Set `current.phase = null` (or leave unchanged) so `learn` routes by the presence of `knowledge-map.json` and the `placement`/`scale.start` state; do not force a teaching phase here.
- Append a `history` entry: `{ date, skill: "research-topic", event: "researched <subject>", result: "wrote knowledge-map.json" }`.
- Bump `updated` to today's date.
- Rewrite `progress.md` in the exact format defined in MANIFEST.md (header line, "Where you are" with the next action, module map, recent history). The module map will be empty/placeholder until `build-curriculum` runs — note the next action is to run placement or build the curriculum.

Do **not** write any `objective.mastery`, `module.status`, or `current.status` level transition. Research is not evidence of learning; mastery is read-only here (only `assess-understanding` and `review-session` may write it).

## Guardrails

- **Workflow is preferred, never required.** Use the dynamic Workflow when it is available — the parallel per-facet fan-out plus adversarial verification is the higher-quality path. But never assume it exists: the headless run may not expose it. Detect-or-attempt, catch any unavailability or failure, and fall through to the deterministic sequential procedure **automatically and silently**. A Workflow attempt must never block, hang, or abort the run.
- **Never stop and never ask.** This skill runs headless; `AskUserQuestion` is unavailable. On any tool shortfall, degrade to the fallback path rather than halting or prompting. The run must always end with valid artifacts.
- **Cite everything.** Every load-bearing claim in `research.md` carries a URL. No uncited assertions — on either the Workflow or the fallback path.
- **Multi-source, not single-source.** Every facet is built from **at least three independent sources**, with load-bearing claims adversarially cross-checked across them; favor primary, authoritative, and canonical sources, and record (don't silently drop) conflicts. This bar is identical on both paths.
- **`knowledge-map.json` must have EXACTLY the five keys** (`concepts`, `misconceptions`, `levelDescriptors`, `authenticTasks`, `resources`) with the field shapes specified, and must be valid JSON. `levelDescriptors` must cover all six keys `"1"`–`"6"`. The contract is identical whether the map was produced by the Workflow synthesis phase or the fallback.
- **Never write mastery.** No `objective.mastery`, no `module.status`, no `current.status` advancement. Mastery is read-only in this skill.
- **Allocate ids as max-suffix + 1; never reuse an id.**
- **Stop if there is no manifest** — tell the user to run `lyceum:learn` first. (This is the one legitimate stop: it is a precondition failure, not a tool shortfall.) Read the manifest first and write it last, bumping `updated`.
- **Keep HTML themeable with a neutral shipped default**; honor `settings.htmlTheme` but never hardcode a non-portable palette as the default.
- **Subject-specific, always.** Level descriptors, misconceptions, and authentic tasks must describe THIS subject, not the abstract scale.
- **Stay tool-agnostic and upstreamable.** Do not hardcode assumptions about Workflow internals or any single search provider; the skill must produce identical artifacts whether or not Workflow is present in the runtime.
