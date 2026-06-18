# Phase 4 — Integration (hero dial, cover, wiring)

**Goal:** wire the P1–P3 pieces into the live screens; bring ResumeHero + the Dashboard
empty-state up to the mockup. Token-only; Aurelia glass stays theme-scoped.

## HARD CONSTRAINTS (from red-team)
1. **Hero dial = MasteryRing dial mode** (NOT a separate component) so `data-testid="mastery-ring"`
   travels into the hero — keeps `Dashboard.test.tsx:32` (`getAllByTestId('mastery-ring').length>0`)
   meaningful. If a separate component were ever used it MUST also expose `data-testid="mastery-ring"`.
2. **SubjectCard stays on the default ring** (no dial) — unchanged DOM.
3. **Tokens only**; any Aurelia glass/gradient under `:root[data-theme="aurelia-dark"]` only.

## Tasks
1. **`ResumeHero.tsx`** — render `<MasteryRing value={summary.meanMastery} size={96} dial label="mastery" />`.
   Add a gilt-gradient backdrop class `resume-hero` enhancement (token-based; the layered gradient lives
   under the Aurelia theme scope, a flat `var(--panel)` base for other themes).
2. **`routes/Dashboard.tsx`** — replace the plain empty-state with a **cover**: `<Sigil/>` + "Lyceum"
   wordmark + tagline + the existing "Load sample subject"/"New subject" CTAs. Keep `data-testid="empty-state"`
   and the seed button so `Dashboard.test.tsx` empty-state test stays green. Add `<SectionDivider label="Your subjects"/>`
   above the subject grid (replacing the plain section title).
3. **`components/AppShell.tsx`** — sidebar brand uses `<Sigil size={28}/>` next to "lyceum"; add
   `<StreakCard days={...}/>` (via `useStreak`) in the sidebar (above or below nav). Guard when streak=0.
4. **CSS** — `.resume-hero` gilt gradient (theme-scoped), cover layout, sidebar streak slot. No literal hex in shared rules.

## Failure scenarios
| When | Then |
|---|---|
| ResumeHero swapped to new testid | Dashboard count assertion false-passes → use MasteryRing dial mode |
| empty-state loses testid/seed button | Dashboard empty-state test breaks → preserve both |
| streak hook errors (not in Tauri) | StreakCard hidden / shows 0, never throws |
| gilt gradient baked into shared `.resume-hero` | other themes regress → theme-scope the gradient |

## Rejection criteria
- DO NOT remove `data-testid="empty-state"` or the seed button. DO NOT give the hero ring a non-`mastery-ring` testid.
- DO NOT bake `backdrop-filter`/literal gradients into shared selectors.

## Acceptance gates
- Full vitest suite green (Roadmap, MasteryRing, Dashboard, Settings, ReviewCard, Analytics, Atoms, MasterySeal).
- `cargo test --workspace` green. `pnpm build` green. `grep` for literal hex in new shared CSS → empty.

## Tests
- Dashboard empty-state test still passes (cover renders the seed CTA). Optional: a hero-dial assertion.

## Cross-phase
- **Assumes:** P1 `Sigil`/`SectionDivider`, P2 `MasteryRing dial` mode, P3 `StreakCard`/`study_streak`.
- **Exports:** the finished, wired UI.
