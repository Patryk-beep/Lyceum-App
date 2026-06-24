export type MdKind =
  | "h2"
  | "bold"
  | "italic"
  | "code"
  | "ul"
  | "ol"
  | "check"
  | "quote"
  | "link";

const WRAP: Partial<Record<MdKind, [string, string]>> = {
  bold: ["**", "**"],
  italic: ["_", "_"],
  code: ["`", "`"],
  link: ["[", "](url)"],
};

const LINE: Partial<Record<MdKind, string>> = {
  h2: "## ",
  ul: "- ",
  ol: "1. ",
  check: "- [ ] ",
  quote: "> ",
};

export interface EditResult {
  content: string;
  selStart: number;
  selEnd: number;
}

/**
 * Apply a Markdown affordance to a textarea value at the given selection. Wrap
 * kinds (bold/italic/code/link) surround the selection; line kinds (h2/ul/ol/
 * check/quote) prefix the line the cursor sits on. Pure → unit-tested; the caller
 * writes `content` back and restores `selStart`/`selEnd` on the textarea.
 */
export function insertMarkdown(
  content: string,
  selStart: number,
  selEnd: number,
  kind: MdKind,
): EditResult {
  const sel = content.slice(selStart, selEnd);
  const wrap = WRAP[kind];
  if (wrap) {
    const [l, r] = wrap;
    const next = content.slice(0, selStart) + l + sel + r + content.slice(selEnd);
    const start = selStart + l.length;
    return { content: next, selStart: start, selEnd: start + sel.length };
  }
  const prefix = LINE[kind]!;
  const lineStart = content.lastIndexOf("\n", selStart - 1) + 1;
  const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
  return {
    content: next,
    selStart: selStart + prefix.length,
    selEnd: selEnd + prefix.length,
  };
}
