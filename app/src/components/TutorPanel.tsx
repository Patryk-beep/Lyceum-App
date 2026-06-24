import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "../lib/ipc";
import type { TutorScope } from "../lib/types";
import { useTutorStore, useTutorThread } from "../stores/useTutorStore";
import { RichMarkdown } from "./RichMarkdown";

/** Slide-in tutor chat for the current subject. Read-only Q&A: streams the answer live
 *  (`claude://tutor` → useTutorStore), renders replies as markdown, persists across opens.
 *  Rendered OUTSIDE AppShell's inert content so it's usable while a skill turn runs. */
export function TutorPanel({ slug, scope }: { slug: string | null; scope: TutorScope }) {
  const open = useTutorStore((s) => s.open);
  const close = useTutorStore((s) => s.closePanel);
  const ask = useTutorStore((s) => s.ask);
  const finish = useTutorStore((s) => s.finish);
  const fail = useTutorStore((s) => s.fail);
  const loadThread = useTutorStore((s) => s.loadThread);
  const reset = useTutorStore((s) => s.reset);
  const seed = useTutorStore((s) => s.seed);
  const clearSeed = useTutorStore((s) => s.clearSeed);
  const { messages, streaming, busy } = useTutorThread(slug);
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Pre-fill the input when opened with a seed (e.g. "explain this selection"),
  // then clear the seed so it doesn't re-apply on the next open.
  useEffect(() => {
    if (open && seed) {
      setDraft(seed);
      clearSeed();
    }
  }, [open, seed, clearSeed]);

  // Seed scrollback from the saved thread when the panel opens for a subject.
  useEffect(() => {
    if (open && slug) {
      api
        .readTutorThread(slug)
        .then((t) => loadThread(slug, t.turns))
        .catch(() => {
          /* not in Tauri / no thread yet */
        });
    }
  }, [open, slug, loadThread]);

  // Keep the latest message in view.
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, streaming, open]);

  const send = useMutation({
    mutationFn: (q: string) => api.askTutor(slug as string, q, scope),
    onSuccess: (text) => finish(slug as string, text),
    onError: (e) => fail(slug as string, `Sorry — I couldn't answer that (${String(e)}).`),
  });

  if (!open || !slug) return null;

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    ask(slug, q);
    setDraft("");
    send.mutate(q);
  };

  return (
    <aside
      className="tutor-panel"
      role="complementary"
      aria-label="Tutor"
      data-testid="tutor-panel"
    >
      <header className="tutor-panel__head">
        <span className="tutor-panel__title">Tutor</span>
        <div className="tutor-panel__spacer" />
        <button
          className="tutor-panel__btn"
          onClick={() => {
            api.clearTutorThread(slug).catch(() => {});
            reset(slug);
          }}
          title="Clear this conversation"
        >
          Clear
        </button>
        <button
          className="tutor-panel__btn"
          onClick={close}
          aria-label="Close tutor"
          title="Close"
        >
          ×
        </button>
      </header>

      <div className="tutor-panel__body" ref={bodyRef} data-testid="tutor-body">
        {messages.length === 0 && !streaming && !busy && (
          <p className="tutor-panel__empty muted">
            Ask anything about what you’re learning — a concept, a hint, or why something works.
            I won’t spoil an open assignment’s answer.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`tutor-msg tutor-msg--${m.role}`}>
            {m.role === "assistant" ? (
              <RichMarkdown slug={slug}>{m.text}</RichMarkdown>
            ) : (
              <p className="tutor-msg__user">{m.text}</p>
            )}
          </div>
        ))}
        {streaming && (
          <div className="tutor-msg tutor-msg--assistant">
            <RichMarkdown slug={slug}>{streaming}</RichMarkdown>
          </div>
        )}
        {busy && !streaming && (
          <div className="tutor-msg tutor-msg--assistant muted">Thinking…</div>
        )}
      </div>

      <form
        className="tutor-panel__input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="tutor-panel__field wizard__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask the tutor…  (Enter to send, Shift+Enter for a new line)"
          rows={2}
          disabled={busy}
          aria-label="Ask the tutor"
        />
        <button
          className="btn btn--primary tutor-panel__send"
          type="submit"
          disabled={busy || !draft.trim()}
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </aside>
  );
}
