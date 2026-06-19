import { useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { InputType } from "../lib/types";

// Basic markdown toolbar: selection-wrapping for inline marks, line-prefix for
// block marks. ponytail: enough "basic editing tools" without an editor library.
const TOOLBAR: {
  label: string;
  title: string;
  wrap?: [string, string];
  line?: string;
}[] = [
  { label: "B", title: "Bold", wrap: ["**", "**"] },
  { label: "I", title: "Italic", wrap: ["_", "_"] },
  { label: "H", title: "Heading", line: "## " },
  { label: "•", title: "Bullet list", line: "- " },
  { label: "</>", title: "Inline code", wrap: ["`", "`"] },
];

/**
 * The student hand-in widget. Pure + props-driven: it owns a draft string and
 * calls `onSubmit(content)`. The widget shape is chosen by `inputType` (the skill
 * declares it on the assignment entry; absent ⇒ "markdown").
 */
export function SubmissionEditor({
  inputType = "markdown",
  options = [],
  language,
  busy = false,
  onSubmit,
}: {
  inputType?: InputType;
  options?: string[];
  language?: string;
  busy?: boolean;
  onSubmit: (content: string) => void;
}) {
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const isChoice = inputType === "choice";
  const isCode = inputType === "code";
  const isMarkdown = inputType === "markdown";
  const isFile = inputType === "file";

  function applyWrap(before: string, after: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    setContent(
      content.slice(0, s) + before + content.slice(s, e) + after + content.slice(e),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + before.length;
      el.selectionEnd = e + before.length;
    });
  }

  function applyLine(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = content.lastIndexOf("\n", s - 1) + 1;
    setContent(content.slice(0, lineStart) + prefix + content.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + prefix.length;
    });
  }

  const canSubmit = content.trim().length > 0 && !busy;

  return (
    <div className="submission" data-testid="submission-editor">
      {isChoice ? (
        <div className="submission__choices" role="radiogroup" aria-label="Answer">
          {options.map((opt) => (
            <label className="submission__choice" key={opt}>
              <input
                type="radio"
                name="submission-choice"
                value={opt}
                data-testid="submission-choice"
                checked={content === opt}
                onChange={() => setContent(opt)}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : (
        <>
          {isFile && (
            <label className="submission__file">
              <span className="muted">Choose a .txt or .md file to hand in</span>
              <input
                type="file"
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                data-testid="submission-file-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setContent(await f.text());
                }}
              />
            </label>
          )}
          {isMarkdown && !preview && (
            <div className="submission__toolbar" data-testid="submission-toolbar">
              {TOOLBAR.map((b) => (
                <button
                  type="button"
                  key={b.title}
                  className="btn btn--ghost submission__tool"
                  title={b.title}
                  onClick={() =>
                    b.wrap ? applyWrap(b.wrap[0], b.wrap[1]) : applyLine(b.line!)
                  }
                >
                  {b.label}
                </button>
              ))}
              <button
                type="button"
                className="btn btn--ghost submission__tool"
                data-testid="submission-preview-toggle"
                onClick={() => setPreview(true)}
              >
                Preview
              </button>
            </div>
          )}
          {isMarkdown && preview ? (
            <article className="reader submission__preview" data-testid="submission-preview">
              <Markdown remarkPlugins={[remarkGfm]}>
                {content || "_Nothing to preview yet._"}
              </Markdown>
              <button
                type="button"
                className="btn btn--ghost submission__tool"
                onClick={() => setPreview(false)}
              >
                Back to edit
              </button>
            </article>
          ) : (
            <textarea
              ref={ref}
              className={`wizard__input submission__textarea${
                isCode ? " submission__textarea--code" : ""
              }`}
              data-testid="submission-textarea"
              placeholder={
                isCode
                  ? `Write your ${language ?? "code"} here…`
                  : isFile
                    ? "Loaded file contents appear here — edit if needed, then submit."
                    : "Write your answer here…"
              }
              value={content}
              spellCheck={!isCode}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
          {isCode && language && (
            <div className="muted metric submission__lang">language: {language}</div>
          )}
        </>
      )}

      <button
        className="btn btn--primary submission__submit"
        data-testid="submission-submit"
        disabled={!canSubmit}
        onClick={() => onSubmit(content)}
      >
        {busy ? "Submitting…" : "Submit hand-in"}
      </button>
    </div>
  );
}
