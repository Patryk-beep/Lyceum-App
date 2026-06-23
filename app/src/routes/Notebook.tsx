import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { RichMarkdown } from "../components/RichMarkdown";
import {
  useDeleteNotebook,
  useNotebooks,
  useSaveNotebook,
  useSubjects,
} from "../lib/query";
import type { NotebookEntry } from "../lib/types";

/** The editor's working copy. `id === null` is an unsaved new note (not persisted
 *  until it has content), otherwise it mirrors a saved note. */
interface Draft {
  id: string | null;
  title: string;
  content: string;
  moduleId?: string;
}

function emptyDraft(moduleId?: string): Draft {
  return { id: null, title: "", content: "", moduleId };
}

function draftIsEmpty(d: Draft): boolean {
  return d.title.trim() === "" && d.content.trim() === "";
}

/** Trigger a `.md` download of a note's body (works in the Tauri webview). */
function exportNote(entry: { title: string; content: string; id: string }) {
  const name = (entry.title.trim() || entry.id).replace(/[^\w.-]+/g, "-");
  const blob = new Blob([entry.content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function NoteList({
  notes,
  activeId,
  onPick,
  onNew,
}: {
  notes: NotebookEntry[];
  activeId: string | null;
  onPick: (n: NotebookEntry) => void;
  onNew: () => void;
}) {
  return (
    <aside className="notebook__list" aria-label="Notes">
      <button
        className="btn btn--primary notebook__new"
        onClick={onNew}
        data-testid="notebook-new"
      >
        + New note
      </button>
      {notes.length === 0 ? (
        <p className="muted notebook__list-empty">No notes yet.</p>
      ) : (
        <ul className="notebook__items">
          {notes.map((n) => (
            <li key={n.id}>
              <button
                className={
                  "notebook__item" +
                  (n.id === activeId ? " notebook__item--active" : "")
                }
                aria-current={n.id === activeId ? "true" : undefined}
                onClick={() => onPick(n)}
              >
                <span className="notebook__item-title">
                  {n.title.trim() || "Untitled note"}
                </span>
                <span className="notebook__item-meta metric faint">
                  {n.updatedAt}
                  {n.moduleId ? ` · ${n.moduleId}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function Editor({
  slug,
  draft,
  saving,
  onChange,
  onBlurSave,
  onDelete,
}: {
  slug: string;
  draft: Draft;
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onBlurSave: () => void;
  onDelete: () => void;
}) {
  const [preview, setPreview] = useState(false);

  return (
    <section className="notebook__editor" aria-label="Note editor">
      <div className="notebook__editor-head">
        <input
          className="wizard__input notebook__title"
          placeholder="Note title"
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={onBlurSave}
          aria-label="Note title"
          data-testid="notebook-title"
        />
        <div className="notebook__editor-tools">
          <div className="notebook__toggle" role="group" aria-label="Editor mode">
            <button
              className={"btn btn--ghost" + (!preview ? " is-on" : "")}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              Write
            </button>
            <button
              className={"btn btn--ghost" + (preview ? " is-on" : "")}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
              data-testid="notebook-preview"
            >
              Preview
            </button>
          </div>
          <span className="notebook__status metric faint" aria-live="polite">
            {saving ? "Saving…" : draft.id ? "Saved" : "Draft"}
          </span>
        </div>
      </div>

      {draft.moduleId && (
        <Link
          className="notebook__anchor"
          to={`/subject/${slug}/lessons`}
          data-testid="notebook-lesson-link"
        >
          ↩ Lesson {draft.moduleId}
        </Link>
      )}

      {preview ? (
        <div className="notebook__preview" data-testid="notebook-rendered">
          {draft.content.trim() ? (
            <RichMarkdown slug={slug}>{draft.content}</RichMarkdown>
          ) : (
            <p className="muted">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          className="notebook__body"
          placeholder="Write your note in Markdown…"
          value={draft.content}
          onChange={(e) => onChange({ content: e.target.value })}
          onBlur={onBlurSave}
          aria-label="Note content"
          data-testid="notebook-body"
        />
      )}

      <div className="notebook__editor-foot">
        <button
          className="btn btn--outline"
          onClick={() =>
            exportNote({
              title: draft.title,
              content: draft.content,
              id: draft.id ?? "note",
            })
          }
          disabled={draftIsEmpty(draft)}
          data-testid="notebook-export"
        >
          Export .md
        </button>
        {draft.id && (
          <button
            className="btn btn--ghost notebook__delete"
            onClick={onDelete}
            data-testid="notebook-delete"
          >
            Delete
          </button>
        )}
      </div>
    </section>
  );
}

export function Notebook() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const [picked, setPicked] = useState<string | null>(null);
  const slug = params.slug ?? picked ?? subjects?.[0]?.slug ?? "";
  const moduleParam = searchParams.get("module") ?? undefined;

  const { data: notes, isLoading } = useNotebooks(slug);
  const save = useSaveNotebook(slug);
  const del = useDeleteNotebook(slug);

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(moduleParam));

  // Keep a ref so the blur handler reads the freshest draft, not a stale closure.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Arriving via ?module=… (from a lesson) starts a fresh anchored note once.
  const seededModule = useRef(false);
  useEffect(() => {
    if (moduleParam && !seededModule.current) {
      seededModule.current = true;
      setDraft(emptyDraft(moduleParam));
    }
  }, [moduleParam]);

  const change = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Persist on blur: update an existing note, or create once a new draft has
  // content (an empty new note is never written). Adopt the new id so the next
  // blur updates instead of creating a duplicate.
  const persist = async () => {
    const d = draftRef.current;
    if (d.id === null && draftIsEmpty(d)) return;
    const saved = await save.mutateAsync({
      id: d.id ?? undefined,
      title: d.title,
      content: d.content,
      moduleId: d.moduleId,
    });
    if (d.id === null) setDraft((cur) => ({ ...cur, id: saved.id }));
  };

  const pick = (n: NotebookEntry) =>
    setDraft({ id: n.id, title: n.title, content: n.content, moduleId: n.moduleId });
  const newNote = () => setDraft(emptyDraft());
  const remove = async () => {
    if (draft.id) await del.mutateAsync(draft.id);
    setDraft(emptyDraft());
  };

  const list = useMemo(() => notes ?? [], [notes]);

  if (!slug && subjectsLoading) return <div className="muted">Loading…</div>;
  if (!slug) return <div className="muted">No subjects yet.</div>;

  const showPicker = !params.slug && (subjects?.length ?? 0) > 1;

  return (
    <div className="notebook" data-testid="notebook">
      <header className="notebook__head">
        <h1>Notebook</h1>
        {showPicker && (
          <select
            className="wizard__input notebook__subject"
            value={slug}
            onChange={(e) => setPicked(e.target.value)}
            data-testid="notebook-subject-picker"
            aria-label="Subject"
          >
            {subjects!.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.subject}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="notebook__panes">
        {isLoading ? (
          <p className="muted">Loading notes…</p>
        ) : (
          <NoteList
            notes={list}
            activeId={draft.id}
            onPick={pick}
            onNew={newNote}
          />
        )}
        <Editor
          slug={slug}
          draft={draft}
          saving={save.isPending}
          onChange={change}
          onBlurSave={persist}
          onDelete={remove}
        />
      </div>
    </div>
  );
}
