import { slugify } from "./slug";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/** Strip the common inline Markdown markers so an outline entry shows clean text.
 *  Mirrors what the reader renders, so `slugify(text)` here matches the id RichMarkdown
 *  stamps on the rendered heading (both reduce to the same visible text). */
function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/** Parse ATX headings (`#`..`###`) from lesson Markdown for the "On this page" outline.
 *  Skips fenced code blocks so a `# comment` inside ``` never shows up.
 *  ponytail: duplicate heading text → duplicate id; clicks scroll to the first. */
export function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = stripInline(m[2]);
    if (!text) continue;
    out.push({ id: slugify(text), text, level: m[1].length });
  }
  return out;
}

/** Does this lesson use "check for understanding" markers we can jump between?
 *  Lessons aren't required to use a fixed format, so this gates the "next check"
 *  action and degrades to hidden when nothing matches.
 *  ponytail: matches the ✎ glyph or a bold "Check"; widen if lessons adopt a marker. */
export function hasChecks(md: string): boolean {
  return /✎|\*\*\s*check\b/i.test(md);
}
