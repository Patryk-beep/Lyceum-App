import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { InputType } from "../lib/types";
import { useZenStore } from "../stores/useZenStore";
import { SubmissionEditor } from "./SubmissionEditor";

const SAVE_DEBOUNCE = 600;

function loadDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Wraps `SubmissionEditor` with a whole-window "zen" write mode. Owns the draft so it
 *  survives the inline↔zen switch and powers autosave; renders inline by default and
 *  portals a full-cover layer to `document.body` when `useZenStore.active`. The brief
 *  (assignment/question/task) shows in a collapsible right rail, default open. */
export function ZenEditor({
  inputType,
  options,
  language,
  busy = false,
  submitLabel,
  onSubmit,
  brief,
  briefTitle = "Reference",
  storageKey,
}: {
  inputType?: InputType;
  options?: string[];
  language?: string;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (content: string) => void;
  brief: React.ReactNode;
  briefTitle?: string;
  storageKey: string;
}) {
  const [content, setContent] = useState(() => loadDraft(storageKey));
  const [saved, setSaved] = useState(true);
  const active = useZenStore((s) => s.active);
  const briefOpen = useZenStore((s) => s.briefOpen);
  const setActive = useZenStore((s) => s.setActive);
  const toggleBrief = useZenStore((s) => s.toggleBrief);
  const reset = useZenStore((s) => s.reset);

  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Announce the surface so the global ⌘⇧Z is a no-op elsewhere; clear on unmount.
  useEffect(() => {
    useZenStore.setState({ available: true });
    return () => reset();
  }, [reset]);

  // Autosave: debounce content → localStorage (runs inline AND in zen — losing work on
  // navigation is the same hazard either way). Restore is the useState initializer, so a
  // non-empty in-memory draft is never clobbered. The cleanup clears the pending timer,
  // so no setState fires after unmount.
  useEffect(() => {
    setSaved(false);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, content);
      } catch {
        /* best-effort */
      }
      setSaved(true);
    }, SAVE_DEBOUNCE);
    return () => clearTimeout(saveTimer.current);
  }, [content, storageKey]);

  // Focus on the active edge. The whole inline subtree unmounts when zen opens (the
  // editor moves into the portal), so the "opener" node would be detached on exit —
  // instead we focus the portal field on enter and the freshly-mounted Zen trigger on
  // exit (WCAG 2.4.3, all entry paths: button, ⌘⇧Z, palette). Below ~1100px the rail
  // starts collapsed so the editor isn't cramped (matchMedia absent in jsdom → no-op).
  useEffect(() => {
    const FIELD = "textarea, input[type=radio], input[type=file]";
    if (active && !wasActive.current) {
      containerRef.current?.querySelector<HTMLElement>(FIELD)?.focus();
      if (window.matchMedia?.("(max-width: 1100px)")?.matches) {
        useZenStore.setState({ briefOpen: false });
      }
    } else if (!active && wasActive.current) {
      // If the host is itself unmounting (submit/nav), the run overlay / route takes focus.
      hostRef.current
        ?.querySelector<HTMLElement>("[data-testid='zen-enter']")
        ?.focus();
    }
    wasActive.current = active;
  }, [active]);

  // Two-stage Esc while active: collapse the rail first (if open), then exit. Exit is
  // always safe (autosaved). Read briefOpen via getState so this never re-subscribes.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (useZenStore.getState().briefOpen) toggleBrief();
      else setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, toggleBrief, setActive]);

  // A submit starts an engine turn (busy); its SkillRunOverlay lives inside the (now
  // inert) shell, so leave zen to reveal it. Also makes the per-question remount on
  // Placement a no-op for zen state.
  useEffect(() => {
    if (busy) setActive(false);
  }, [busy, setActive]);

  const handleSubmit = (c: string) => {
    // Cancel the pending autosave so a queued debounce can't resurrect the draft we clear.
    clearTimeout(saveTimer.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* best-effort */
    }
    onSubmit(c);
  };

  const enter = () => setActive(true);

  const editor = (
    <SubmissionEditor
      inputType={inputType}
      options={options}
      language={language}
      busy={busy}
      submitLabel={submitLabel}
      value={content}
      onChange={setContent}
      onSubmit={handleSubmit}
    />
  );

  if (!active) {
    return (
      <div className="zen-host" ref={hostRef}>
        <div className="zen-host__bar">
          <button
            type="button"
            className="btn btn--ghost zen-host__enter"
            data-testid="zen-enter"
            onClick={enter}
            title="Zen write mode (⌘⇧Z)"
          >
            ⤢ Zen
          </button>
        </div>
        {editor}
      </div>
    );
  }

  return createPortal(
    <div
      className="zen"
      data-testid="zen"
      ref={containerRef}
      aria-label="Zen writing mode"
    >
      {/* The cover occludes the topbar's drag region, so this strip carries its own —
          else the window becomes undraggable. (Tauri lets the buttons keep their clicks.) */}
      <div className="zen__header" data-tauri-drag-region>
        <span className="zen__save muted" data-testid="zen-save" role="status">
          {saved ? "Saved ✓" : "Saving…"}
        </span>
        <span className="zen__hint muted">Esc to exit</span>
        <button
          type="button"
          className="btn btn--ghost zen__close"
          data-testid="zen-exit"
          onClick={() => setActive(false)}
          aria-label="Exit zen mode"
        >
          ×
        </button>
      </div>
      <div className="zen__main">
        <div className="zen__canvas">{editor}</div>
        <aside
          className={`zen__rail ${briefOpen ? "is-open" : "is-closed"}`}
          role="complementary"
          aria-label={briefTitle}
        >
          <button
            type="button"
            className="zen__rail-toggle"
            data-testid="zen-rail-toggle"
            onClick={toggleBrief}
            aria-expanded={briefOpen}
            aria-controls="zen-rail-body"
            aria-label={briefOpen ? "Collapse reference" : "Expand reference"}
            title="Toggle prompt panel (⌘⇧')"
          >
            {briefOpen ? "›" : "‹"}
          </button>
          {briefOpen && (
            <div className="zen__rail-body" id="zen-rail-body" data-testid="zen-rail">
              <div className="zen__rail-header">{briefTitle}</div>
              <div className="zen__rail-content reader-screen">{brief}</div>
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  );
}
