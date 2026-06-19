import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { useDeleteLesson, useLessons } from "../lib/query";
import type { LessonEntry } from "../lib/types";

/** Pure list of lessons with open + delete per row. */
export function LessonsView({
  slug,
  lessons,
  onDelete,
}: {
  slug: string;
  lessons: LessonEntry[];
  onDelete?: (lesson: LessonEntry) => void;
}) {
  if (lessons.length === 0) {
    return (
      <div className="muted" data-testid="lessons-empty">
        No lessons yet — they appear here once a module is taught.
      </div>
    );
  }
  return (
    <div className="artifact-list" data-testid="lessons-list">
      {lessons.map((l) => (
        <div className="card artifact-row" data-testid="lesson-row" key={l.file}>
          <div className="artifact-row__main">
            <div className="artifact-row__title">{l.title ?? l.file}</div>
            <div className="artifact-row__meta">
              {l.file}
              {l.moduleId ? ` · ${l.moduleId}` : ""}
              {l.moduleStatus ? ` · ${l.moduleStatus}` : ""}
            </div>
          </div>
          <div className="artifact-row__actions">
            <Link
              className="btn btn--outline"
              to={`/subject/${slug}/lesson/${encodeURIComponent(l.file)}`}
            >
              Open
            </Link>
            <button
              className="btn btn--ghost"
              style={{ color: "var(--danger)" }}
              data-testid="lesson-delete"
              onClick={() => onDelete?.(l)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** /subject/:slug/lessons */
export function Lessons() {
  const { slug = "" } = useParams();
  const { data: lessons, isLoading } = useLessons(slug);
  const del = useDeleteLesson(slug);
  const [confirming, setConfirming] = useState<LessonEntry | null>(null);

  if (isLoading) return <div className="muted">Loading lessons…</div>;

  return (
    <div className="reader-screen">
      <h1 style={{ fontFamily: "var(--font-serif)", marginBottom: 4 }}>Lessons</h1>
      <LessonsView slug={slug} lessons={lessons ?? []} onDelete={setConfirming} />
      {confirming && (
        <ConfirmDestructive
          title="Delete this lesson?"
          body={
            confirming.moduleId
              ? "The lesson file is removed and its module is re-opened — the next step will re-deliver it. Your mastery scores are kept; existing reviews are not removed."
              : "This lesson isn’t tied to a module, so the file is just removed (re-teach can’t be armed)."
          }
          danger={
            confirming.moduleStatus === "mastered"
              ? "This module is already mastered — re-teaching may change your mastery score when you next submit work."
              : undefined
          }
          confirmLabel={confirming.moduleId ? "Delete & re-open" : "Delete lesson"}
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            del.mutate(
              { moduleId: confirming.moduleId ?? "", file: confirming.file },
              { onSettled: () => setConfirming(null) },
            )
          }
        />
      )}
    </div>
  );
}
