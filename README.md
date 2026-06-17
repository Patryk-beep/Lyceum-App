# Lyceum App

**The companion application to the [Lyceum](https://github.com/Patryk-beep/lyceum) learning system — in early development.**

Lyceum App takes the same evidence-based skill principles of the Lyceum system and turns them into a standalone, interactive learning application: a real app that runs the full research → placement → curriculum → teach → assign → assess → review → capstone loop, with spaced repetition and mastery gating built in.

> **Status:** The app itself is **not built yet**. This repository currently hosts the project's landing page (live below). The Lyceum **plugin** that the app is based on **works today** inside Claude Code — see *Use it now*.

- **Live page:** https://patryk-beep.github.io/Lyceum-App/
- **The system behind the app (Lyceum plugin):** https://github.com/Patryk-beep/lyceum

## The concept

Lyceum is a portable, subject-agnostic meta-learning system. It teaches *any* subject — calculus, the cello, contract law, Rust — from absolute beginner to mastery, using the techniques with the strongest empirical support: retrieval practice, spaced repetition, interleaving, deliberate practice, mastery learning, and backward design.

All course state lives in one `manifest.json` per subject, so a course can pause, resume across sessions, survive a context reset, and transfer between machines by copying a folder. **Your folder is the save file.** Only assessment and review write mastery scores, so "feeling fluent" never inflates the data.

The app turns this loop — proven inside Claude Code as a plugin — into a dedicated learning environment.

## The nine-skill learning loop

1. **learn** — orchestrator / entry point; sets up the workspace, captures start & target level, routes to the next step.
2. **research-topic** — deep research into a teachable knowledge map (concepts, prerequisites, misconceptions, level descriptors, authentic tasks).
3. **placement-test** — ~10-item adaptive test that recommends a starting level.
4. **build-curriculum** — backward-designed curriculum across the learner's level band, ordered by a prerequisite graph.
5. **teach-lesson** — teaches the current module concrete-first, checks understanding, free-recall close, seeds spaced reviews.
6. **create-assignment** — a level-appropriate assignment + rubric, calibrated to the edge of ability.
7. **assess-understanding** — grades a submission, gives feedback that teaches, updates mastery, schedules reviews.
8. **review-session** — spaced-repetition review of due items (the biggest long-term-retention lever).
9. **capstone** — an authentic, defended, rubric-scored mastery project + certification.

Steps 5–8 repeat per module until mastery, then the course closes at the capstone.

## Use it now (the plugin)

The app is coming, but you can use the full method today. In [Claude Code](https://code.claude.com):

```
/plugin marketplace add Patryk-beep/lyceum
/plugin install lyceum@lyceum-marketplace
```

Then invoke the `learn` skill, name your subject, and pick your target level.

## Status

- ✅ **Foundation / landing page** — live at https://patryk-beep.github.io/Lyceum-App/
- ✅ **Method available now** — via the Lyceum plugin for Claude Code
- 🚧 **Standalone app** — in development (not yet installable)

The landing page is a single self-contained `index.html` (inline CSS, one Google Fonts link, no build step) served via GitHub Pages.

## License

MIT © 2026 Patryk Szakody — see [LICENSE](LICENSE).
