import { useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../lib/ipc";
import { searchNotes } from "../lib/notebookSearch";
import { useSubjects } from "../lib/query";

/** The global `/notebook` view: every subject's notes in one searchable list.
 *  Editing stays subject-scoped — selecting a note jumps to that subject's
 *  notebook editor (deep-linked via ?note=). */
export function NotebookGlobal() {
  const { data: subjects, isLoading } = useSubjects();
  const [query, setQuery] = useState("");

  const results = useQueries({
    queries: (subjects ?? []).map((s) => ({
      queryKey: ["notebook", s.slug],
      queryFn: () => api.listNotebooks(s.slug),
      enabled: !!s.slug,
    })),
  });

  const items = (subjects ?? []).flatMap((s, i) =>
    searchNotes(results[i]?.data ?? [], query).map((hit) => ({ hit, subject: s })),
  );
  // Newest-updated first across all subjects (ISO dates sort lexically).
  items.sort((a, b) =>
    a.hit.entry.updatedAt < b.hit.entry.updatedAt ? 1 : -1,
  );

  if (isLoading) return <div className="muted">Loading…</div>;
  if (!subjects || subjects.length === 0)
    return <div className="muted">No subjects yet.</div>;

  return (
    <div className="notebook notebook--global" data-testid="notebook-global">
      <header className="notebook__head">
        <h1>All notes</h1>
        <input
          className="wizard__input notebook__search"
          type="search"
          placeholder="Search all notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search all notes"
          data-testid="notebook-global-search"
        />
      </header>

      {items.length === 0 ? (
        <p className="muted">{query ? "No matches." : "No notes yet."}</p>
      ) : (
        <ul className="notebook__items notebook__items--global">
          {items.map(({ hit, subject }) => (
            <li key={`${subject.slug}:${hit.entry.id}`}>
              <Link
                className="notebook__item"
                to={`/subject/${subject.slug}/notebook?note=${hit.entry.id}`}
              >
                <span className="notebook__item-title">
                  {hit.entry.title.trim() || "Untitled note"}
                </span>
                <span className="notebook__item-snippet muted">{hit.snippet}</span>
                <span className="notebook__item-meta metric faint">
                  {subject.subject} · {hit.entry.updatedAt}
                  {hit.entry.moduleId ? ` · ${hit.entry.moduleId}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
