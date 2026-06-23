---
description: "Idea → implementation pipeline: brainstorm → rune:plan → rune:adversary red-team → hand off to ruflo (swarm/autopilot) for execution."
argument-hint: "[idea or feature to build]  [optional: --autopilot for unattended run-to-done] [optional: --no-adversary to skip the red-team pass]"
---

Run the full idea-to-implementation chain for: **$ARGUMENTS**

Drive these phases in order. Do not stop between them unless a phase needs a user decision.

1. **Brainstorm** — invoke the `rune:brainstorm` skill on the idea above. Generate 2-3 category-diverse approaches with trade-offs (risk + cost per approach) and converge on a recommended one. If the idea is vague, ask the user to pick before proceeding.

2. **Plan** — invoke the `rune:plan` skill on the chosen approach. Produce the master plan + phase files at `.rune/plan-<feature>.md` (vertical-slice phases). ruflo has **no** plan skill, so `rune:plan` is the planner — do not substitute SPARC.

3. **Adversarial review (default ON)** — invoke the `rune:adversary` skill on the plan from step 2 (pass the `.rune/plan-<feature>.md` path). It red-teams the plan **before any code is written**: edge cases, security holes, scalability/perf bottlenecks, error propagation, missing rollback/failure paths. Save the report to `.rune/adversary-<feature>.md`, then **fold confirmed must-fix findings back into the plan file** so ruflo executes the hardened plan. If a finding invalidates the chosen approach (not just a fixable gap), **STOP** and surface it — that's a user decision (loop back to brainstorm/plan). Skip this phase **only** when `--no-adversary` is passed.

4. **Hand off to ruflo for implementation** — do **NOT** auto-invoke `rune:cook`/`rune:team`. Instead route execution to ruflo, passing the (now red-teamed) `.rune/plan-<feature>.md` path as context:
   - Default (attended, parallel): `ruflo swarm "<objective from the plan>" --strategy development` — or the MCP equivalent (`swarm_init {topology:"hierarchical"}` → `agent_spawn` per phase → `task_orchestrate`).
   - If `--autopilot` was passed (unattended, run-to-done): `ruflo autopilot` until all phase tasks complete.
   - ruflo owns logic routing + implementation from here.

5. **Report** — summarize: chosen approach, plan file path, the adversarial report path + which findings were folded in vs. deferred (or note it was skipped via `--no-adversary`), and what ruflo executed (or is executing).

Project-scoped wiring; see the "Idea → Implementation pipeline" section in `CLAUDE.md`.
