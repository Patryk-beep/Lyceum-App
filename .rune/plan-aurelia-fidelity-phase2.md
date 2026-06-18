# Phase 2 — Mastery visuals (medallion seal + opt-in gilt dial)

**Goal:** richer `MasterySeal` (gilded medallion / marble lock) and a `MasteryRing` "gilt dial"
mode — token-only, backward-compatible with every existing test.

## HARD CONSTRAINTS (from red-team — non-negotiable)
1. **MasterySeal single-root contract.** Keep `data-testid="mastery-seal"` AND `data-state={state}`
   on ONE root `<span>`; `data-state` is the RAW `SealState` (`'earned'|'active'|'available'|'locked'`),
   never a visual name. Medallion SVG / lock / pulse live on CHILD nodes or the existing
   `mastery-seal--${state}` class. No nested node may carry `data-testid="mastery-seal"`. Public API
   stays `{ state: SealState }` (no new required props) — `Roadmap.tsx:76` + `Capstone.tsx:35` compile unchanged.
2. **Dial is OPT-IN.** `MasteryRing` new prop `dial?: boolean` (+ optional `label?: string`) defaults
   to the **legacy ring**. Only ResumeHero opts in (P4). `MasteryRing.test.tsx` + `SubjectCard` render
   the default. In BOTH modes the root keeps `data-testid="mastery-ring"`, class `mastery-ring`,
   `aria-label={`mastery ${label}`}`, and `style` width/height = size.
3. **Real text nodes.** Number `${Math.round(value*100)}%` and the null-case em-dash `—` (U+2014) are
   real JSX text nodes INSIDE the testid root (NO CSS `::before/content`, NO SVG `<text>` outside the
   root). `value==null` → renders `—`, never `0%`/`N/A`. GILT label is additive (separate child).
4. **TOKENS ONLY, no mockup literals.** dial inner disc = `var(--panel-2)`; number = `var(--text)`;
   GILT label = `var(--gold)`; medallion = `radial-gradient(circle at 35% 30%, var(--gold-bright), var(--gold))`,
   rim `var(--gold-line)`; earned glyph = dark ink `#1a1505` (existing `.btn--primary`/`.mastery-seal--earned`
   convention) — **NOT white** (white = 1.59:1 on gold, fails). Light-theme guard: 1px `var(--gold-line)`
   ring on the medallion.

## Tasks
1. **`MasterySeal.tsx`** — keep the root span + testid + data-state + `mastery-seal--${state}` class.
   Inside: `earned` → medallion span (gold radial gradient + dark-ink ★); `locked` → marble disc
   (`var(--panel-2)`) + 🔒 lock svg in `var(--faint)`; `active` → pulsing `var(--gold)` ring; `available`
   → dashed/outline `var(--gold-line)`. CSS in `components.css` (`.mastery-seal--*`), tokens only.
2. **`MasteryRing.tsx`** — add `dial`/`label` props. Default branch = current ring (unchanged DOM).
   Dial branch: same root, add inner `.mastery-ring__disc` (`var(--panel-2)`) holding the number text
   + a small `.mastery-ring__label` ({label}, uppercase via CSS) in `var(--gold)`. Conic gradient uses
   `var(--gold)`/`var(--line)` (already token-based).
3. **CSS** — `.mastery-seal--earned/active/available/locked`, `.mastery-ring__disc/__label`. No literal hex.

## Failure scenarios
| When | Then |
|---|---|
| medallion gradient hardcoded gold | breaks Momentum (teal) → use `var(--gold-bright/--gold)` |
| dial number SVG `<text>` | jsdom can't see it → real JSX text node |
| `dial` prop required | SubjectCard/tests break → default `false` |
| white glyph | 1.59:1 contrast fail → dark ink `#1a1505` |

## Rejection criteria
- DO NOT remap `data-state` to a visual name. DO NOT add nested `data-testid="mastery-seal"`.
- DO NOT render the number via CSS content or SVG text. DO NOT use literal hex except the dark-ink `#1a1505` glyph.

## Acceptance gates
- `grep -nE '#[0-9A-Fa-f]{6}'` over new MasterySeal/MasteryRing CSS → only `#1a1505` permitted.
- Existing `Roadmap.test.tsx`, `MasteryRing.test.tsx`, `Dashboard.test.tsx` stay green.
- New: MasterySeal `state='available'` → `data-state==='available'`; MasteryRing `dial label="gilt"` shows `%` + "gilt".

## Tests
- Extend `MasteryRing.test.tsx`: dial mode renders the label + `%`, default mode unchanged.
- New `MasterySeal.test.tsx`: all four states render with correct `data-state` (incl. `available`).

## Cross-phase
- **Assumes:** nothing. **Exports:** `MasteryRing dial` mode for P4 ResumeHero; richer `MasterySeal` for Roadmap.
