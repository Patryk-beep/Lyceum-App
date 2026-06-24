import type { NotebookEntry } from "./types";

export interface NoteHit {
  entry: NotebookEntry;
  /** A short excerpt to show under the title (the match context, or the first line). */
  snippet: string;
  /** Character offset of the match within `content`, or -1 (no content match / no query). */
  matchIndex: number;
}

function firstLine(content: string): string {
  const line = content.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").slice(0, 80);
}

/** ~60-char window around a content match, with ellipses. */
function snippetAround(content: string, idx: number, len: number): string {
  if (idx < 0) return firstLine(content);
  const start = Math.max(0, idx - 24);
  const end = Math.min(content.length, idx + len + 36);
  const core = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + core + (end < content.length ? "…" : "");
}

/**
 * Client-side lexical search over already-loaded notes. Empty query → all notes
 * unchanged (first-line preview). Otherwise: keep notes whose title or content
 * contains the query, ranked title-matches-first then earliest-match, with a
 * snippet around the content match. Pure + deterministic (no Date/locale), so it
 * is unit-tested directly.
 */
export function searchNotes(notes: NotebookEntry[], query: string): NoteHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return notes.map((entry) => ({
      entry,
      snippet: firstLine(entry.content),
      matchIndex: -1,
    }));
  }

  const scored: { hit: NoteHit; score: number }[] = [];
  for (const entry of notes) {
    const titleIdx = entry.title.toLowerCase().indexOf(q);
    const contentIdx = entry.content.toLowerCase().indexOf(q);
    if (titleIdx < 0 && contentIdx < 0) continue;
    // Title hits sort above content hits; within each, the earliest match wins.
    const score =
      titleIdx >= 0 ? titleIdx : 1_000_000 + (contentIdx < 0 ? 0 : contentIdx);
    scored.push({
      hit: { entry, snippet: snippetAround(entry.content, contentIdx, q.length), matchIndex: contentIdx },
      score,
    });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.hit);
}
