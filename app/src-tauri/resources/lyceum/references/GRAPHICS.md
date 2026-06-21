# GRAPHICS.md — the lesson-graphics output contract

**Every content skill that emits a visual reads this file.** It defines *which* graphics format to reach for, *where* a file graphic goes, and the *guardrails* that keep a graphic from rendering as a broken-image placeholder in the Lyceum app.

The Lyceum app renders all markdown through one shared renderer (`RichMarkdown`) that supports exactly the channels below. **Anything outside them degrades** — a bad diagram falls back to its raw source, a missing/unsupported image falls back to its alt caption. The app fallback is the real backstop; this contract is best-effort skill guidance to keep graphics *useful*, not just non-broken.

---

## Decision rule — pick the most reliable format that carries the idea

Reliability-ranked (most reliable first). Prefer the highest rung that fits:

| Need | Use | Why this rung |
|---|---|---|
| Tabular / comparison data | **GFM table** | Always renders; no engine to misfire. |
| Math, formulas, notation | **KaTeX** block `$$…$$` | Deterministic; offline fonts. |
| Simple boxes / trees / pipelines | **ASCII / Unicode** in a fenced code block | Plain text — can't break. |
| Flow / sequence / state / graph | **` ```mermaid `** | LLM mermaid is ~86–97% syntactically correct even for strong models — keep it simple, and prefer a table/ASCII when that carries the same info. |
| Nothing above fits (custom illustration) | **hand-authored `.svg` file** | Last resort; the only image the IPC can serve. |

**Math delimiter rule:** block math uses `$$…$$`. **Bare single `$` is NOT math** in this app (it's off so prose prices, shell, and regex don't garble). Write currency as `\$5` and inline math as `$$…$$`.

---

## File graphics — path & naming (SVG only)

When (and only when) you author an `.svg` file:

- **Directory:** `learning/<slug>/assets/`
- **Filename:** `<moduleId>-<n>.svg` — the **stable module id**, e.g. `m03-1.svg`, `m03-2.svg`. **Never** name by the title slug (title slugs change on re-teach and orphan the file).
- **Reference (relative to the SUBJECT ROOT, never `../`):**
  ```markdown
  ![A Venn diagram showing the overlap of sets A and B](assets/m03-1.svg)
  ```
  The app's read guard rejects `..`/absolute paths, so an `assets/…` reference from the lesson markdown resolves; a `../…` reference degrades to the alt caption.

**Orphan control** (the writing skill does this before emitting a lesson's graphics):
```bash
mkdir -p learning/<slug>/assets
rm -f learning/<slug>/assets/<moduleId>-*.svg   # re-teach overwrites, never accumulates
```

---

## Guardrails (FORBID / REQUIRE)

- **FORBID raster** — no PNG/JPG/GIF/WebP. The delivery IPC reads text only (it cannot serve binary), and raster fails WCAG 1.4.5 (text-in-image). A raster `![](…)` shows as an alt caption, not the image.
- **FORBID external / remote URLs** (`http(s)://`, protocol-relative `//`). Graphics are offline by construction.
- **UTF-8 plain-text SVG only.** No embedded raster (`<image href="data:…">`), no external `href`, no `<!DOCTYPE>`, no `<script>`. This keeps the no-raster, no-network guarantee real (an `<img>`-loaded SVG can't run script, but keep the file clean anyway).
- **REQUIRE informative alt text** on every image — describe what the graphic *shows*, not "diagram" (WCAG 1.1.1). The alt is also the visible fallback, so make it carry the idea on its own.
- **Decoration is not dual coding.** A visual must carry information the prose doesn't restate. If it's decorative, drop it.

These are best-effort guidance. The app renderer is the actual backstop: it never shows a broken-image placeholder — it degrades (mermaid → raw code, image → alt caption, bad math → readable source).
