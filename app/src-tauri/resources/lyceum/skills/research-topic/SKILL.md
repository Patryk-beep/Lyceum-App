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

1. **Plan the research.** Identify the subject from `manifest.subject`. You are building a map a curriculum designer can teach from, so plan to cover, for THIS specific subject: how the field is structured; the core concepts and sub-skills; the **prerequisite relationships** among them; **common misconceptions** and where beginners get stuck; what competence looks like at **each of the 6 levels** (use LEVELS.md as the frame); the **authentic tasks** practitioners actually perform; and canonical learning resources.

2. **Do multi-source research.** Use web search and fetch across several independent sources. If a deep-research subagent or skill is available, prefer it for breadth and cross-checking. Cross-reference claims; favor primary, authoritative, and canonical sources. Capture the URL for every load-bearing claim — you will cite all of them.

3. **Write `research.md`** at `learning/<slug>/research.md` — a readable briefing organized by the topics in step 1, with **every claim cited (URL)**. This is for the human (and you) to read; keep it clear and well-structured. While gathering, note any diagrams, worked examples, or concrete illustrations that `teach-lesson` could reuse (dual coding) and reference them here.

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

- **Cite everything.** Every load-bearing claim in `research.md` carries a URL. No uncited assertions.
- **Multi-source, not single-source.** Do not build the map from one page; cross-check across independent sources.
- **`knowledge-map.json` must have EXACTLY the five keys** (`concepts`, `misconceptions`, `levelDescriptors`, `authenticTasks`, `resources`) with the field shapes specified, and must be valid JSON. `levelDescriptors` must cover all six keys `"1"`–`"6"`.
- **Never write mastery.** No `objective.mastery`, no `module.status`, no `current.status` advancement. Mastery is read-only in this skill.
- **Allocate ids as max-suffix + 1; never reuse an id.**
- **Stop if there is no manifest** — tell the user to run `lyceum:learn` first. Read the manifest first and write it last, bumping `updated`.
- **Keep HTML themeable with a neutral shipped default**; honor `settings.htmlTheme` but never hardcode a non-portable palette as the default.
- **Subject-specific, always.** Level descriptors, misconceptions, and authentic tasks must describe THIS subject, not the abstract scale.
