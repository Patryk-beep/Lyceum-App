import { describe, expect, it } from "vitest";

// Bundle guard (plan G2 — "non-negotiable"): mermaid is ~2.6MB and MUST stay lazy. The
// ONLY allowed reference in bundled app source is the dynamic `import("mermaid")` in
// MermaidDiagram.tsx. A STATIC `import … from "mermaid"` would pull the whole library into
// the initial chunk with no other signal — this test is that missing signal.
//
// `import.meta.glob(?raw)` reads every source file's text at test time (a Vite primitive,
// no node:fs needed). Test files (which mock mermaid via a static import) and the setup
// dir are excluded — they're never bundled.
const sources = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("bundle guard: mermaid stays lazy", () => {
  it("has no static `from \"mermaid\"` import in bundled source", () => {
    // `import type … from "mermaid"` is erased at compile time (allowed); a runtime
    // `import … from "mermaid"` is not.
    const offending = /(^|\n)\s*import\s+(?!type\b)[^;]*\bfrom\s+["']mermaid["']/;
    const offenders = Object.entries(sources)
      .filter(([path]) => !/(\/__tests__\/|\/test\/|\.test\.tsx?$)/.test(path))
      .filter(([, code]) => offending.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
