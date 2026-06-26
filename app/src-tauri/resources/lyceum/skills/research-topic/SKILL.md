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
4. `${CLAUDE_PLUGIN_ROOT}/references/GRAPHICS.md` — the graphics output contract. Any visual in `research.md` follows it (table/KaTeX `$$…$$`/ASCII/mermaid/`assets/` SVG; no raster or remote-URL images — the app can't serve them).

Then read the active subject manifest at `learning/<slug>/manifest.json`. If no manifest exists, **STOP** and tell the user to run `lyceum:learn` first — `learn` creates the workspace and captures the subject and target. Do not invent a manifest here.

From the manifest, read `subject` (what to research) and `settings.htmlTheme` (for the optional HTML render).

## Process

1. **Plan the research.** Identify the subject from `manifest.subject`. You are building a map a curriculum designer can teach from. Decompose the subject into these seven research facets, which you will research independently and then synthesize: (a) **structure of the field** — how the discipline is organized, its major branches and how they relate; (b) **core concepts and sub-skills** — the load-bearing ideas and capabilities a learner must acquire; (c) **prerequisite relationships** — what must be understood before what (the dependency graph among concepts); (d) **common misconceptions** — where beginners predictably go wrong and get stuck, and the corrections; (e) **level descriptors** — what competence looks like at each of the 6 levels, framed by LEVELS.md (CEFR/Dreyfus mode, dominant Bloom verbs, fading scaffolding) and specific to THIS subject; (f) **authentic tasks** — the real tasks practitioners actually perform, tagged by level; (g) **canonical resources** — primary, authoritative learning materials. These seven facets are the unit of parallel research below and map directly onto the knowledge-map contract.

2. **Run the research as four passes — Researcher → Reviewer → Verifier → Writer.** The four passes ARE the method; orchestration is secondary. Run them over the seven facets:

   - **Researcher** — gather, per facet, across **at least three independent, authoritative/primary sources**, attaching the **URL** to every load-bearing claim.
   - **Reviewer** — critique and **rank** the sources gathered for each facet: prefer primary/authoritative, demote weak/derivative/SEO sources, and note where a facet's source set is thin.
   - **Verifier (self-verifying citations)** — for each **load-bearing** claim, confirm the cited source actually states it. **Verify against content already retrieved this run — never re-fetch a URL already fetched** (the Researcher pulled it moments ago; re-fetching only risks the host's no-output watchdog killing the run). Make **at most one repair attempt per claim, and never retry a URL in a loop**. A source that *cannot be reached* — as opposed to one that is reached and *contradicts* the claim — is **not grounds to drop** a claim that was corroborated at gather time: mark it `unverified` and keep it. Only drop or repair claims that are reached and found *unsupported* or *contradicted*. Where authoritative sources genuinely **disagree**, record the disagreement (it becomes `openQuestions`, step 4) rather than silently dropping it.
   - **Writer (write-floor)** — synthesize the verified, ranked, disagreement-annotated facets into `research.md` and the five-required-key `knowledge-map.json` (steps 3–4). **Always emit valid artifacts from whatever is verified so far, even if verification is incomplete** — write each artifact once and as early as the facets allow, so an interruption never leaves the run with no artifacts.

   **Orchestration — the sequential path is the spec'd path, Workflow is only an optional accelerator.** This skill's instruction to use the Workflow tool is itself the explicit opt-in; you are authorized to invoke it. *If* a dynamic Workflow is available you MAY accelerate the **Researcher** pass with parallel per-facet agents (`parallel()` over `agent(prompt, { schema })`) and run Verify/Write as later phases — but the headless run usually will **not** expose it, so do not rely on it. **If the Workflow tool is unavailable, not registered, refuses, errors, or returns no usable structured output, do NOT stop and do NOT ask the user.** Silently run the **same four passes** sequentially with `WebSearch`/`WebFetch`: Research each facet in turn, Review and rank its sources, self-verify its load-bearing claims **against already-fetched content**, then Write the two artifacts. **The sequential path is the floor and the normal case** — identical four passes, identical min-3-sources, citation, and self-verification discipline; only the Researcher's fan-out is sequential instead of parallel. Whichever path runs, the run must always terminate with valid `research.md` and `knowledge-map.json`.

3. **Write `research.md`** at `learning/<slug>/research.md` — a readable briefing organized by the seven facets from step 1, with **every claim cited (URL)**. This is for the human (and you) to read; keep it clear and well-structured. Where authoritative sources genuinely **agree, conflict, or leave a question open**, say so explicitly (e.g. "sources agree X; A and B disagree on Y; Z is unsettled") — each position still carries its URL. This consensus/disagreement signal is exactly what makes the content teachable, and the open questions feed `knowledge-map.openQuestions`. While gathering, note any diagrams, worked examples, or concrete illustrations that `teach-lesson` could reuse (dual coding) and reference them here.

4. **Write `knowledge-map.json`** at `learning/<slug>/knowledge-map.json` — the machine contract for the curriculum. Use these **five required keys**, plus the **optional `openQuestions`** — and **no other top-level keys**:
   - `concepts`: array of `{ id, name, summary, entryLevel (1–6), prereqs: [ids] }`. Allocate concept ids consistently (e.g. `c01`, `c02`, …) using max-suffix + 1; every id in a `prereqs` array must reference a real concept id. `entryLevel` is the level at which the concept first appears.
   - `misconceptions`: array of `{ concept, misconception, correction }` — where beginners go wrong and how to fix it.
   - `levelDescriptors`: an object keyed `"1"` through `"6"`, each value describing what mastery looks like **in THIS subject** at that level. Write all six using LEVELS.md (CEFR/Dreyfus mode, dominant Bloom verbs, fading scaffolding) so they are subject-specific, not generic restatements of the scale.
   - `authenticTasks`: array of `{ level, task }` — the real tasks practitioners perform, tagged by level. These feed assignments and the capstone, so make them concrete and doable.
   - `resources`: array of `{ title, url, note }` — canonical learning resources, each with a one-line note on what it is good for.
   - `openQuestions` *(optional)*: array of `{ concept, question, positions: [ { stance, source } ], note }` — genuine, source-backed **open questions / live debates in the field** tied to a concept. `concept` is a concept **`id`** (e.g. `c03`) — the **same convention as `misconceptions[].concept`**, so `teach-lesson` can join on it. Each `positions[].source` is a **URL** (the same citation discipline as every other claim). Record only *real, cited* disagreement — **never manufacture controversy**; for settled subjects **omit the key or use `[]`** (`absent ≡ [] ≡ none`). This is field-level "experts still disagree," NOT a learner misconception.

   Validate that the JSON is well-formed and contains the five required keys (plus optionally `openQuestions`, and **no other top-level keys**) before saving.

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
- **Graphics follow GRAPHICS.md.** Any visual in `research.md` uses a supported channel — never raster or remote-URL images (the app degrades them to a caption); math is `$$…$$` only. (`research.html` styling stays governed by THEMES.md.)
- **Multi-source, not single-source.** Every facet is built from **at least three independent sources**, with load-bearing claims adversarially cross-checked across them; favor primary, authoritative, and canonical sources, and record (don't silently drop) conflicts. This bar is identical on both paths.
- **`knowledge-map.json` must have exactly these five required keys** (`concepts`, `misconceptions`, `levelDescriptors`, `authenticTasks`, `resources`), **plus optionally `openQuestions` — and no other top-level keys**, with the field shapes specified, and must be valid JSON. `levelDescriptors` must cover all six keys `"1"`–`"6"`. `openQuestions`, when present, holds only genuine source-backed field disagreement (never manufactured); for settled subjects it is omitted or `[]`. The contract is identical whether the map was produced by the Workflow path or the sequential fallback.
- **Never write mastery.** No `objective.mastery`, no `module.status`, no `current.status` advancement. Mastery is read-only in this skill.
- **Allocate ids as max-suffix + 1; never reuse an id.**
- **Stop if there is no manifest** — tell the user to run `lyceum:learn` first. (This is the one legitimate stop: it is a precondition failure, not a tool shortfall.) Read the manifest first and write it last, bumping `updated`.
- **Keep HTML themeable with a neutral shipped default**; honor `settings.htmlTheme` but never hardcode a non-portable palette as the default.
- **Subject-specific, always.** Level descriptors, misconceptions, and authentic tasks must describe THIS subject, not the abstract scale.
- **Stay tool-agnostic and upstreamable.** Do not hardcode assumptions about Workflow internals or any single search provider; the skill must produce identical artifacts whether or not Workflow is present in the runtime.
