import { useMemo, useState } from "react";

import { hasChecks, parseHeadings } from "../lib/lessonOutline";
import { useSaveNotebook } from "../lib/query";
import { Notebook } from "../routes/Notebook";
import { useTutorStore } from "../stores/useTutorStore";

const COLLAPSE_KEY = "lyceum-lessonrail-collapsed";
const MODE_KEY = "lyceum-lessonrail-mode";

type Mode = "outline" | "notebook";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* best-effort */
  }
}

/** The learner's current text selection, but only when it lies inside the lesson
 *  article — so the study actions never pick up sidebar/UI chrome text. */
function lessonSelection(): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return "";
  const article = document.querySelector(".lesson-layout .reader");
  if (article && sel.anchorNode && article.contains(sel.anchorNode)) {
    return sel.toString().trim();
  }
  return "";
}

/** Scroll the lesson body to the next check-for-understanding below the topbar.
 *  ponytail: DOM text scan on click (✎ glyph / "check"); the action is only shown
 *  when hasChecks() already found a marker in the source, so this rarely misses. */
function jumpToNextCheck(): void {
  const article = document.querySelector(".lesson-layout .reader");
  if (!article) return;
  const re = /✎|\bcheck\b/i;
  const blocks = Array.from(
    article.querySelectorAll("p, li, blockquote, h2, h3, h4, strong"),
  ).filter((el) => re.test(el.textContent ?? ""));
  const next =
    blocks.find((el) => el.getBoundingClientRect().top > 84) ?? blocks[0];
  next?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Right-side study companion on the lesson view: an "On this page" outline + study
 *  actions, switchable to the subject Notebook docked side-by-side. */
export function LessonRail({
  slug,
  moduleId,
  markdown,
}: {
  slug: string;
  moduleId: string | null;
  markdown: string;
}) {
  const [collapsed, setCollapsed] = useState(() => safeGet(COLLAPSE_KEY) === "1");
  const [mode, setMode] = useState<Mode>(() =>
    safeGet(MODE_KEY) === "notebook" ? "notebook" : "outline",
  );
  const [flash, setFlash] = useState("");

  const headings = useMemo(() => parseHeadings(markdown), [markdown]);
  const checks = useMemo(() => hasChecks(markdown), [markdown]);

  const openWith = useTutorStore((s) => s.openWith);
  const openPanel = useTutorStore((s) => s.openPanel);
  const save = useSaveNotebook(slug);

  const pickMode = (m: Mode) => {
    setMode(m);
    safeSet(MODE_KEY, m);
  };
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      safeSet(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const askTutor = () => {
    const sel = lessonSelection();
    if (sel) openWith(`Explain this from the lesson, simply:\n\n“${sel}”`);
    else openPanel();
  };

  const makeFlashcard = async () => {
    const sel = lessonSelection();
    if (!sel) {
      setFlash("Select some lesson text first, then add a flashcard.");
      return;
    }
    // A cloze note (==…==) reconciles into the SRS card store on save. The whole
    // selection is hidden — coarse by design; refine the cloze in the Notebook.
    const title = sel.split(/\s+/).slice(0, 7).join(" ");
    try {
      await save.mutateAsync({ title, content: `==${sel}==`, moduleId: moduleId ?? undefined });
      setFlash("✓ Flashcard saved — open the Notebook to refine it.");
      pickMode("notebook");
    } catch {
      setFlash("Couldn’t save the flashcard. Try again.");
    }
  };

  if (collapsed) {
    return (
      <aside className="lesson-rail lesson-rail--collapsed" aria-label="Study companion">
        <button
          className="lesson-rail__reopen"
          onClick={toggleCollapsed}
          aria-label="Show study panel"
          title="Show study panel"
          data-testid="lessonrail-reopen"
        >
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={"lesson-rail" + (mode === "notebook" ? " lesson-rail--notebook" : "")}
      aria-label="Study companion"
      data-testid="lesson-rail"
    >
      <div className="lesson-rail__head">
        <div className="lesson-rail__tabs" role="tablist" aria-label="Study panel">
          <button
            role="tab"
            aria-selected={mode === "outline"}
            className={"lesson-rail__tab" + (mode === "outline" ? " is-on" : "")}
            onClick={() => pickMode("outline")}
          >
            On this page
          </button>
          <button
            role="tab"
            aria-selected={mode === "notebook"}
            className={"lesson-rail__tab" + (mode === "notebook" ? " is-on" : "")}
            onClick={() => pickMode("notebook")}
            data-testid="lessonrail-notebook-tab"
          >
            Notebook
          </button>
        </div>
        <button
          className="lesson-rail__collapse"
          onClick={toggleCollapsed}
          aria-label="Hide study panel"
          title="Hide study panel"
        >
          ›
        </button>
      </div>

      {mode === "outline" ? (
        <div className="lesson-rail__body">
          <nav className="lesson-outline" aria-label="On this page">
            {headings.length === 0 ? (
              <p className="muted lesson-outline__empty">No sections in this lesson.</p>
            ) : (
              <ul className="lesson-outline__list">
                {headings.map((h, i) => (
                  <li key={`${h.id}-${i}`}>
                    <button
                      className={`lesson-outline__item lesson-outline__item--h${h.level}`}
                      onClick={() => scrollTo(h.id)}
                      title={h.text}
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <div className="lesson-rail__actions">
            <p className="lesson-rail__actions-label">Study</p>
            <button
              className="btn btn--outline lesson-rail__action"
              onClick={makeFlashcard}
              disabled={save.isPending}
              data-testid="lessonrail-flashcard"
            >
              🃏 New flashcard from selection
            </button>
            <button className="btn btn--outline lesson-rail__action" onClick={askTutor}>
              💬 Ask tutor about selection
            </button>
            {checks && (
              <button
                className="btn btn--outline lesson-rail__action"
                onClick={jumpToNextCheck}
              >
                ✎ Jump to next check
              </button>
            )}
            {flash && (
              <p className="lesson-rail__flash" aria-live="polite">
                {flash}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="lesson-rail__notebook">
          <Notebook />
        </div>
      )}
    </aside>
  );
}
