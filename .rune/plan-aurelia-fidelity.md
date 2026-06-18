# Plan — Aurelia Visual Fidelity (hardened)

> Bring the live Lyceum-App UI up to the **Aurelia Dark** mockup. **Token-driven** —
> every new visual reads theme variables, so Night/Almanac/Momentum gain the same
> polish. Scope (confirmed): **visual fidelity only** — NOT the poetic vocabulary.
> Hardened by 2 adversarial series (64 findings → 10 confirmed, see §Red-team).

## Phases

| # | Phase | Key files | Done when |
|---|---|---|---|
| 1 | Visual atoms | `Sigil.tsx`, `SectionDivider.tsx`, gilt CSS tokens | sigil + divider render; **no literal hex / no shared-rule glass**; vitest green |
| 2 | Mastery visuals | `MasterySeal.tsx` (medallion), `MasteryRing.tsx` (opt-in gilt dial) | seals/dial token-only; **single-root `data-state`, opt-in `dial`, real-text-node number**; existing tests still pass |
| 3 | Study streak | `lyceum-core/streak.rs`, `study_streak` cmd, `StreakCard.tsx` | pure helper + 5 edge tests; cross-subject union; Rust + vitest green |
| 4 | Integration | `ResumeHero` (dial mode), Dashboard cover empty-state, `AppShell` | dividers/streak/sigil wired; **hero uses `MasteryRing dial`**; full suite green |

Phases 1–3 are independent; Phase 4 integrates all three.

## Key decisions (hardened)
- **HARD TOKEN RULE.** New component CSS contains **ZERO literal hex** and **ZERO baked
  `backdrop-filter`/translucency in shared selectors**; all color/surface comes from theme
  tokens (`--text`, `--panel/-2/-3`, `--gold/-bright/-line`, `--line`). Any Aurelia-only glass
  goes under a `:root[data-theme="aurelia-dark"]` override. A grep-for-hex gate runs in P1 & P2.
- **Additive component APIs (test contracts).** `MasterySeal` keeps `data-testid="mastery-seal"`
  + raw `data-state` (SealState string) on ONE root span, API `{state: SealState}`. `MasteryRing`
  gains an OPT-IN `dial`/`label` prop (default = legacy ring) and keeps `data-testid="mastery-ring"`,
  the `mastery-ring` class, `aria-label`, and number/em-dash as **real text nodes** in both modes.
- **Streak is cross-subject + pure-tested.** `current_streak(dates,today)->u32` (dedup, walk back
  from today; today-missing-but-yesterday-present still counts; empty=0). `study_streak()` unions
  `history[].date` across `list_slugs`; UTC `today()` (documented).
- **Cover, not splash.** Gilded sigil + tagline = Dashboard *empty-state* + sidebar brand.
- **No new deps / no CDN.** Sigil inlined SVG; EB Garamond/Jost already bundled.

## Decision compliance (project-locked)
- Default theme Aurelia Dark ✓ · visuals enhance ALL themes (token-driven) ✓ · core stays pure ✓
- **Contrast verified on all 4 themes** — dial number `var(--text)` on `var(--panel-2)` ≥4.5:1;
  earned glyph dark-ink `#1a1505` on `var(--gold)` ≥4.5:1; no gold-on-teal brand clash on Momentum.
- files <500 lines ✓ · tight CSP / no CDN ✓

## Red-team (folded from 2 adversarial series)
2 critical (theme-breaking literals; MasterySeal single-root contract) · 3 high (white-glyph
contrast; opt-in dial default; real-text-node DOM) · medium/low (dial=MasteryRing-mode not separate
component; shared-rule glass ban; define all 4 seal states + 'available' test; streak algorithm/edges).
Rejected 3 false positives (duplicate class-rename / Capstone-no-test / disc-inversion — all subsumed).
Full detail per phase in `plan-aurelia-fidelity-phase{1..4}.md`.

## Risks
- Headless = no visual verify → component tests + token correctness + grep-for-hex gate; user smoke.
- Mockup→token translation gap: every literal in the mockup must map to a token before coding (gated).
- False-pass masking: Dashboard `mastery-ring` count >0 stays true if hero loses its ring → P4 commits
  to MasteryRing-dial-mode so the testid travels into the hero.
- Streak UTC boundary (late-evening local) → acceptable, documented in P3.

## Status
⬚ P1 · ⬚ P2 · ⬚ P3 · ⬚ P4 — plan **hardened**; implementing.
