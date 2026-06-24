import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../lib/ipc";

const MODES: { mode: string; label: string }[] = [
  { mode: "flashcards", label: "Flashcards" },
  { mode: "summarize", label: "Summarize" },
  { mode: "related", label: "Related" },
  { mode: "tags", label: "Tags" },
];

/** Read-only AI assist for a note. Each mode asks the Lyceum assistant (a read-only
 *  claude child) for a suggestion; the result is shown in an EDITABLE box the learner
 *  accepts (appended into the note) or rejects (discarded). Nothing auto-applies. */
export function NotebookAssist({
  slug,
  content,
  onAccept,
}: {
  slug: string;
  content: string;
  onAccept: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const assist = useMutation({
    mutationFn: (mode: string) => api.notebookAssist(slug, mode, content),
    onSuccess: (text) => setResult(text),
  });

  const empty = content.trim() === "";

  return (
    <div className="notebook__assist">
      <button
        className="btn btn--ghost notebook__assist-toggle"
        onClick={() => setOpen((o) => !o)}
        disabled={empty}
        aria-expanded={open}
        data-testid="notebook-assist-toggle"
      >
        ✨ AI assist
      </button>

      {open && (
        <div className="notebook__assist-menu" role="group" aria-label="AI assist">
          {MODES.map((m) => (
            <button
              key={m.mode}
              className="btn btn--ghost"
              onClick={() => assist.mutate(m.mode)}
              disabled={assist.isPending || empty}
              data-testid={`assist-${m.mode}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {assist.isPending && <p className="muted notebook__assist-status">Thinking…</p>}
      {assist.isError && (
        <p className="notebook__assist-status" style={{ color: "var(--danger)" }}>
          Assist failed: {String(assist.error)}
        </p>
      )}

      {result !== null && (
        <div className="notebook__assist-result" data-testid="assist-result">
          <textarea
            className="notebook__body notebook__assist-text"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            aria-label="AI suggestion (editable)"
          />
          <div className="notebook__assist-actions">
            <button
              className="btn btn--primary"
              onClick={() => {
                onAccept(result);
                setResult(null);
                setOpen(false);
              }}
              data-testid="assist-accept"
            >
              Accept
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => setResult(null)}
              data-testid="assist-reject"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
