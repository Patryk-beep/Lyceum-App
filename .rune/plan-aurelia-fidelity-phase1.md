# Phase 1 — Visual atoms (Sigil, SectionDivider, gilt tokens)

**Goal:** the two reusable Aurelia atoms, token-only so all 4 themes benefit.

## Code contracts
```ts
// components/Sigil.tsx
export function Sigil({ size = 120 }: { size?: number }): JSX.Element  // inlined SVG laurel + gilt "L"
// components/SectionDivider.tsx
export function SectionDivider({ label }: { label: string }): JSX.Element // gold gradient rules either side of an uppercase label
```

## Tasks
1. **`src/components/Sigil.tsx`** — inline SVG: two concentric thin gold rings + laurel sprays + a
   serif "L" wordmark in gilt. Strokes/fills use `currentColor` or theme tokens via CSS, NOT literal
   hex. Wrap in `<span data-testid="sigil" className="sigil" style={{width:size,height:size}}>`.
2. **`src/components/SectionDivider.tsx`** — `<div className="section-divider"><span class="rule"/><span class="section-divider__label">{label}</span><span class="rule rule--r"/></div>`. testid `section-divider`.
3. **`components/components.css`** — `.sigil` (color: var(--gold)), `.section-divider` (gold gradient
   rules via `linear-gradient(90deg,transparent,var(--gold))` and reverse), label `font: var(--font-sans)`,
   uppercase, letter-spacing, color `var(--gold)`. Any Aurelia-only blur ONLY under `:root[data-theme="aurelia-dark"]`.

## Rejection criteria (DO NOT)
- DO NOT use any literal hex in the new selectors — tokens only.
- DO NOT put `backdrop-filter`/`rgba()` translucency in the shared `.sigil`/`.section-divider` rules.
- DO NOT add a heading font / CDN link — reuse `var(--font-serif)`/`var(--font-sans)`.

## Acceptance gates
- `grep -nE '#[0-9A-Fa-f]{6}' ` over the **new** `.sigil`/`.section-divider` CSS blocks → empty.
- `grep -n 'backdrop-filter'` in those shared blocks → empty.
- vitest: `<Sigil/>` renders `[data-testid="sigil"]` containing `<svg>`; `<SectionDivider label="II · The Frieze"/>` shows the label text.

## Tests
- `src/components/__tests__/Atoms.test.tsx` — Sigil renders svg; SectionDivider renders the label.

## Cross-phase
- **Exports:** `Sigil`, `SectionDivider` consumed by P4 (cover, section headers, sidebar brand).
- **Assumes:** nothing.
