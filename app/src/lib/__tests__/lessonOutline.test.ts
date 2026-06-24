import { describe, expect, it } from "vitest";

import { hasChecks, parseHeadings } from "../lessonOutline";

describe("parseHeadings", () => {
  it("extracts h1–h3 with level, clean text, and a slug id", () => {
    const md = [
      "# Lesson m01 — Generative encoding",
      "intro prose",
      "## 0. A puzzle to start",
      "### **Theo** vs *Mara*",
      "#### too deep (ignored)",
    ].join("\n");
    const hs = parseHeadings(md);
    expect(hs).toEqual([
      { id: "lesson-m01-generative-encoding", text: "Lesson m01 — Generative encoding", level: 1 },
      { id: "0-a-puzzle-to-start", text: "0. A puzzle to start", level: 2 },
      { id: "theo-vs-mara", text: "Theo vs Mara", level: 3 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = "## Real heading\n```\n# not a heading\n```\n## After fence";
    expect(parseHeadings(md).map((h) => h.text)).toEqual([
      "Real heading",
      "After fence",
    ]);
  });
});

describe("hasChecks", () => {
  it("detects the ✎ glyph or a bold Check marker, else false", () => {
    expect(hasChecks("text ✎ **Check** answer first")).toBe(true);
    expect(hasChecks("**Check** in your own words")).toBe(true);
    expect(hasChecks("just ordinary lesson prose")).toBe(false);
  });
});
