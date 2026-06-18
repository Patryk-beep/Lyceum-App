# THEMES.md — HTML theming

Any HTML output (`research.html`, an optional `progress.html` dashboard) is themeable. Keep colors in **one small theme block** at the top of the generated HTML so it stays easy to retheme, and pick the palette named by `settings.htmlTheme`. **The shipped default is `default` (neutral)** so the plugin transfers cleanly to anyone.

How a skill chooses the palette:
1. Read `settings.htmlTheme` from the manifest (set when the workspace was created).
2. If it names a palette below, use it. Otherwise fall back to `default`.

Render with CSS variables so the palette is swappable in one place, e.g.:

```css
:root{
  --bg: #ffffff; --surface: #f4f4f5; --text: #18181b; --muted: #71717a;
  --accent: #2563eb; --accent-2: #0ea5e9; --good: #16a34a; --warn: #d97706; --bad: #dc2626;
  --border: #e4e4e7;
}
```

---

## `default` — neutral (shipped default; use for anything you distribute)

| Token | Hex |
|---|---|
| `--bg` | `#ffffff` |
| `--surface` | `#f4f4f5` |
| `--text` | `#18181b` |
| `--muted` | `#71717a` |
| `--accent` | `#2563eb` |
| `--accent-2` | `#0ea5e9` |
| `--good` | `#16a34a` |
| `--warn` | `#d97706` |
| `--bad` | `#dc2626` |
| `--border` | `#e4e4e7` |

---

## `rose-pine-moon` — Patryk's personal palette

Official Rosé Pine Moon palette. Use only when `settings.htmlTheme == "rose-pine-moon"`; keep the shipped default neutral.

| Token | Role | Hex |
|---|---|---|
| `--bg` | Base | `#232136` |
| `--surface` | Surface | `#2a273f` |
| `--overlay` | Overlay | `#393552` |
| `--text` | Text | `#e0def4` |
| `--muted` | Muted | `#6e6a86` |
| `--subtle` | Subtle | `#908caa` |
| `--accent` (Iris) | links / headings | `#c4a7e7` |
| `--accent-2` (Foam) | secondary accent | `#9ccfd8` |
| `--good` (Pine) | pass / success | `#3e8fb0` |
| `--warn` (Gold) | caution / due | `#f6c177` |
| `--bad` (Love) | fail / miss | `#eb6f92` |
| `--rose` | highlight | `#ea9a97` |
| `--border` (Highlight Med) | borders | `#44415a` |

CSS block for this theme:

```css
:root{
  --bg:#232136; --surface:#2a273f; --overlay:#393552; --text:#e0def4;
  --muted:#6e6a86; --subtle:#908caa; --accent:#c4a7e7; --accent-2:#9ccfd8;
  --good:#3e8fb0; --warn:#f6c177; --bad:#eb6f92; --rose:#ea9a97; --border:#44415a;
}
```

---

## Personal default (without changing the shipped default)

The shipped manifest default is `htmlTheme: "default"`. To set a *personal* default that does not leak into anything you distribute, the `learn` skill seeds a new subject's `settings` from an **optional** user preferences file at `~/.claude/lyceum.local.json` (e.g. `{ "htmlTheme": "rose-pine-moon" }`). If that file is absent (the normal case for anyone you share the plugin with), `learn` uses the neutral defaults. So: your machine renders Rosé Pine Moon by default; everyone else gets neutral.
