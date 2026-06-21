import DOMPurify from "dompurify";
import { useEffect, useId, useState } from "react";

import { useThemeStore } from "../stores/useThemeStore";

// Memoize the import PROMISE (not just the module) so N diagrams on a page trigger ONE
// lazy mermaid load + init, not N. mermaid is ~2.6MB minified — it MUST stay in its own
// async chunk, so this file uses ONLY a dynamic import() (a static `from "mermaid"` would
// pull it into the index bundle; the build's bundle guard forbids that).
let mermaidPromise: Promise<(typeof import("mermaid"))["default"]> | null = null;
const loadMermaid = () => (mermaidPromise ??= import("mermaid").then((m) => m.default));

// Monotonic per-render counter. useId() is stable across a StrictMode mount→cleanup→mount
// cycle, so without this the discarded and committed mounts would call mermaid.render with
// the SAME id and race on its temp #d{id} measuring node (a transient fallback flash). A
// fresh suffix per effect run keeps each render's DOM scratch space disjoint.
let renderSeq = 0;

/**
 * A fenced ```mermaid block. Lazy-loads mermaid, renders to SVG, sanitizes, and injects.
 * Any failure (bad LLM syntax, render throw) degrades to the raw source in a <pre> — never
 * a blank or a crash. `securityLevel:'strict'` + DOMPurify is defense-in-depth (mermaid
 * strict mode has had label-injection CVEs); the pinned ^11.10.0 is the other half.
 */
export function MermaidDiagram({ code }: { code: string }) {
  // React 18 useId() returns ":r0:"; mermaid does querySelector('#'+id) internally, and
  // ':' is an invalid CSS selector char → every diagram would throw and fall back. Strip.
  const id = "mmd" + useId().replace(/:/g, "");
  const theme = useThemeStore((s) => s.theme);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // Unique id per effect run so a StrictMode double-mount can't collide on mermaid's
    // temp DOM nodes (still colon-free, so querySelector('#'+id) stays valid).
    const runId = `${id}-${++renderSeq}`;
    setSvg(null);
    setFailed(false);
    loadMermaid()
      .then(async (mermaid) => {
        // Re-init each run so a theme switch re-themes the diagram (hex pulled from CSS).
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          themeVariables: themeVariables(),
        });
        await mermaid.parse(code); // rejects on invalid syntax → caught below
        const { svg: rendered } = await mermaid.render(runId, code);
        if (!alive) return;
        setSvg(
          DOMPurify.sanitize(rendered, { USE_PROFILES: { svg: true, svgFilters: true } }),
        );
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      // mermaid appends temp measuring nodes; on a render error it may not remove them.
      document.getElementById(runId)?.remove();
      document.getElementById("d" + runId)?.remove();
    };
  }, [code, id, theme]);

  if (failed) {
    return (
      <pre className="reader__mermaid-fallback">
        <code>{code}</code>
      </pre>
    );
  }
  if (svg === null) {
    // Reserve height so a page of diagrams doesn't "popcorn" as each resolves.
    return <div className="reader__mermaid reader__mermaid--loading" aria-hidden="true" />;
  }
  return (
    <div
      className="reader__mermaid"
      role="img"
      aria-label="diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// mermaid themeVariables accept hex only — pull the active palette from CSS vars so
// diagrams track the current theme. Missing tokens fall back to mermaid's base defaults.
// (If a future theme uses oklch/hsl tokens, normalize to hex here or theming breaks.)
function themeVariables(): Record<string, string> {
  if (typeof getComputedStyle === "undefined" || typeof document === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const map: Record<string, string> = {
    primaryColor: "--panel-2",
    primaryTextColor: "--text",
    primaryBorderColor: "--line",
    lineColor: "--muted",
    secondaryColor: "--panel",
    tertiaryColor: "--canvas",
    background: "--canvas",
    mainBkg: "--panel-2",
    nodeTextColor: "--text",
  };
  const out: Record<string, string> = {};
  for (const [key, token] of Object.entries(map)) {
    const v = cs.getPropertyValue(token).trim();
    if (v) out[key] = v;
  }
  return out;
}
