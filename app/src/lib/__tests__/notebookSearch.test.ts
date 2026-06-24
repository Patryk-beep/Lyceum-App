import { describe, expect, it } from "vitest";

import { searchNotes } from "../notebookSearch";
import type { NotebookEntry } from "../types";

function note(over: Partial<NotebookEntry>): NotebookEntry {
  return {
    id: "nb000",
    title: "",
    content: "",
    createdAt: "2026-06-20",
    updatedAt: "2026-06-20",
    tags: [],
    ...over,
  };
}

const NOTES = [
  note({ id: "nb001", title: "Ser vs Estar", content: "Estar for location." }),
  note({ id: "nb002", title: "Greetings", content: "Use ser for identity and traits." }),
  note({ id: "nb003", title: "Numbers", content: "uno dos tres" }),
];

describe("searchNotes", () => {
  it("returns all notes (first-line preview) for an empty query", () => {
    const hits = searchNotes(NOTES, "  ");
    expect(hits).toHaveLength(3);
    expect(hits[0].matchIndex).toBe(-1);
    expect(hits[2].snippet).toBe("uno dos tres");
  });

  it("filters to title-or-content matches", () => {
    const ids = searchNotes(NOTES, "ser").map((h) => h.entry.id);
    expect(ids).toContain("nb001"); // title "Ser vs Estar"
    expect(ids).toContain("nb002"); // content "ser for identity"
    expect(ids).not.toContain("nb003");
  });

  it("ranks title matches above content matches", () => {
    const hits = searchNotes(NOTES, "ser");
    expect(hits[0].entry.id).toBe("nb001"); // title hit first
  });

  it("produces a snippet around a content match with the offset", () => {
    const hit = searchNotes(NOTES, "identity")[0];
    expect(hit.entry.id).toBe("nb002");
    expect(hit.matchIndex).toBe(note({ content: "Use ser for identity and traits." }).content.indexOf("identity"));
    expect(hit.snippet.toLowerCase()).toContain("identity");
  });

  it("is case-insensitive", () => {
    expect(searchNotes(NOTES, "ESTAR")).toHaveLength(1);
  });
});
