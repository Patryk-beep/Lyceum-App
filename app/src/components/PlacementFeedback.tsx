import { useState } from "react";

import { RichMarkdown } from "./RichMarkdown";

const VERDICT: Record<string, { glyph: string; label: string; cls: string }> = {
  correct: { glyph: "✓", label: "Correct", cls: "is-correct" },
  partial: { glyph: "~", label: "Partial", cls: "is-partial" },
  incorrect: { glyph: "✗", label: "Incorrect", cls: "is-incorrect" },
};

/**
 * Compact, collapsible "last answer" feedback for the placement flow. Default-COLLAPSED:
 * a placement test measures rather than teaches, and the model writes a verbose paragraph,
 * so the verdict chip is the always-visible signal and the full markdown explanation expands
 * on demand. Keeps the new question — not the retrospective — as the visual focus.
 */
export function PlacementFeedback({
  verdict,
  feedback,
}: {
  verdict?: string;
  feedback: string;
}) {
  const [open, setOpen] = useState(false);
  const v = (verdict && VERDICT[verdict]) || null;
  return (
    <div className="pfeedback" data-testid="placement-feedback">
      <button
        type="button"
        className="pfeedback__summary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="pfeedback-body"
      >
        {v && <span className={`pfeedback__chip ${v.cls}`}>{v.glyph} {v.label}</span>}
        <span className="pfeedback__label">Feedback on your last answer</span>
        <span className="pfeedback__caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="pfeedback__body reader" id="pfeedback-body">
          <RichMarkdown>{feedback}</RichMarkdown>
        </div>
      )}
    </div>
  );
}
