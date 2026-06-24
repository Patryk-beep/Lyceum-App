import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { NotebookReview } from "../components/NotebookReview";
import { RichMarkdown } from "../components/RichMarkdown";
import { insertMarkdown, type MdKind } from "../lib/markdownEdit";
import { searchNotes, type NoteHit } from "../lib/notebookSearch";
import {
  useDeleteNotebook,
  useNotebookDueCount,
  useNotebooks,
  useSaveNotebook,
  useSubjects,
} from "../lib/query";

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

const TOOLS: { kind: MdKind; label: string; title: string }[] = [
  { kind: "h2", label: "H", title: "Heading" },
  { kind: "bold", label: "B", title: "Bold" },
  { kind: "italic", label: "I", title: "Italic" },
  { kind: "code", label: "</>", title: "Code" },
  { kind: "ul", label: "•", title: "Bullet list" },
  { kind: "check", label: "☑", title: "Checklist" },
  { kind: "quote", label: "❝", title: "Quote" },
  { kind: "link", label: "🔗", title: "Link" },
  { kind: "cloze", label: "🃏", title: "Make flashcard (==cloze==)" },
];

function Toolbar({ onInsert }: { onInsert: (k: MdKind) => void }) {
  return (
    <div className="notebook__toolbar" role="toolbar" aria-label="Formatting">
      {TOOLS.map((t) => (
        <button
          key={t.kind}
          type="button"
          className="notebook__tool"
          title={t.title}
          aria-label={t.title}
          // Keep the textarea focused + selected so the insert lands at the cursor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(t.kind)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function NoteList({
  hits,
  activeId,
  query,
  onQuery,
  onPick,
  onNew,
}: {
  hits: NoteHit[];
  activeId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onPick: (hit: NoteHit) => void;
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
      <input
        className="wizard__input notebook__search"
        type="search"
        placeholder="Search notes…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label="Search notes"
        data-testid="notebook-search"
      />
      {hits.length === 0 ? (
        <p className="muted notebook__list-empty">
          {query ? "No matches." : "No notes yet."}
        </p>
      ) : (
        <ul className="notebook__items">
          {hits.map((hit) => (
            <li key={hit.entry.id}>
              <button
                className={
                  "notebook__item" +
                  (hit.entry.id === activeId ? " notebook__item--active" : "")
                }
                aria-current={hit.entry.id === activeId ? "true" : undefined}
                onClick={() => onPick(hit)}
              >
                <span className="notebook__item-title">
                  {hit.entry.title.trim() || "Untitled note"}
                </span>
                <span className="notebook__item-snippet muted">{hit.snippet}</span>
                <span className="notebook__item-meta metric faint">
                  {hit.entry.updatedAt}
                  {hit.entry.moduleId ? ` · ${hit.entry.moduleId}` : ""}
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
  preview,
  setPreview,
  bodyRef,
  onChange,
  onBlurSave,
  onInsert,
  onDelete,
}: {
  slug: string;
  draft: Draft;
  saving: boolean;
  preview: boolean;
  setPreview: (v: boolean) => void;
  bodyRef: React.RefObject<HTMLTextAreaElement>;
  onChange: (patch: Partial<Draft>) => void;
  onBlurSave: () => void;
  onInsert: (k: MdKind) => void;
  onDelete: () => void;
}) {
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
        <>
          <Toolbar onInsert={onInsert} />
          <textarea
            ref={bodyRef}
            className="notebook__body"
            placeholder="Write your note in Markdown…"
            value={draft.content}
            onChange={(e) => onChange({ content: e.target.value })}
            onBlur={onBlurSave}
            aria-label="Note content"
            data-testid="notebook-body"
          />
        </>
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
  const noteParam = searchParams.get("note") ?? undefined;

  const { data: notes, isLoading } = useNotebooks(slug);
  const { data: dueCount = 0 } = useNotebookDueCount(slug);
  const save = useSaveNotebook(slug);
  const del = useDeleteNotebook(slug);

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(moduleParam));
  const [preview, setPreview] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // A selection to apply to the textarea after the next content render (toolbar
  // insert, or scroll-to-match when opening a search hit).
  const pendingSel = useRef<[number, number] | null>(null);

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

  // Deep-link ?note=<id> (from search/backlinks/global) pre-opens that note once.
  const openedNote = useRef(false);
  useEffect(() => {
    if (noteParam && !openedNote.current && notes) {
      const n = notes.find((x) => x.id === noteParam);
      if (n) {
        openedNote.current = true;
        setDraft({ id: n.id, title: n.title, content: n.content, moduleId: n.moduleId });
      }
    }
  }, [noteParam, notes]);

  // Apply a pending selection (focus + setSelectionRange scrolls it into view).
  useEffect(() => {
    if (pendingSel.current && bodyRef.current) {
      const [s, e] = pendingSel.current;
      pendingSel.current = null;
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(s, e);
    }
  }, [draft.content]);

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

  const insert = (kind: MdKind) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const r = insertMarkdown(
      draftRef.current.content,
      ta.selectionStart,
      ta.selectionEnd,
      kind,
    );
    pendingSel.current = [r.selStart, r.selEnd];
    change({ content: r.content });
  };

  const pick = (hit: NoteHit) => {
    const n = hit.entry;
    setPreview(false);
    setDraft({ id: n.id, title: n.title, content: n.content, moduleId: n.moduleId });
    if (hit.matchIndex >= 0) {
      pendingSel.current = [hit.matchIndex, hit.matchIndex + query.trim().length];
    }
  };
  const newNote = () => {
    setPreview(false);
    setDraft(emptyDraft());
  };
  const remove = async () => {
    if (draft.id) await del.mutateAsync(draft.id);
    setDraft(emptyDraft());
  };

  const hits = useMemo(() => searchNotes(notes ?? [], query), [notes, query]);

  if (!slug && subjectsLoading) return <div className="muted">Loading…</div>;
  if (!slug) return <div className="muted">No subjects yet.</div>;

  const showPicker = !params.slug && (subjects?.length ?? 0) > 1;

  return (
    <div className="notebook" data-testid="notebook">
      <header className="notebook__head">
        <h1>Notebook</h1>
        <div className="notebook__head-tools">
          {dueCount > 0 && !reviewing && (
            <button
              className="btn btn--primary notebook__review-btn"
              onClick={() => setReviewing(true)}
              data-testid="notebook-review-start"
            >
              Review {dueCount} card{dueCount === 1 ? "" : "s"}
            </button>
          )}
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
        </div>
      </header>

      {reviewing ? (
        <NotebookReview slug={slug} onExit={() => setReviewing(false)} />
      ) : (
        <div className="notebook__panes">
          {isLoading ? (
            <p className="muted">Loading notes…</p>
          ) : (
            <NoteList
              hits={hits}
              activeId={draft.id}
              query={query}
              onQuery={setQuery}
              onPick={pick}
              onNew={newNote}
            />
          )}
          <Editor
            slug={slug}
            draft={draft}
            saving={save.isPending}
            preview={preview}
            setPreview={setPreview}
            bodyRef={bodyRef}
            onChange={change}
            onBlurSave={persist}
            onInsert={insert}
            onDelete={remove}
          />
        </div>
      )}
    </div>
  );
}
