import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ArtifactView } from "../components/ArtifactView";
import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { useDeleteLesson, useLessons, useNotebooks } from "../lib/query";

/** Backlinks: notes anchored to this lesson's module + a quick "add note" that
 *  pre-anchors a new note to the module (?module=). */
function LessonNotes({ slug, moduleId }: { slug: string; moduleId: string | null }) {
  const { data: notes } = useNotebooks(slug);
  const mine = (notes ?? []).filter((n) => moduleId && n.moduleId === moduleId);
  const addTo = `/subject/${slug}/notebook${moduleId ? `?module=${moduleId}` : ""}`;

  return (
    <section className="lesson-notes" aria-label="Notes for this lesson">
      <div className="lesson-notes__head">
        <h2 className="dashboard__section-title">Your notes</h2>
        <Link className="btn btn--outline" to={addTo} data-testid="lesson-add-note">
          + Add note
        </Link>
      </div>
      {mine.length === 0 ? (
        <p className="muted">No notes for this lesson yet.</p>
      ) : (
        <ul className="lesson-notes__list">
          {mine.map((n) => (
            <li key={n.id}>
              <Link to={`/subject/${slug}/notebook?note=${n.id}`}>
                <span className="lesson-notes__title">
                  {n.title.trim() || "Untitled note"}
                </span>
                <span className="metric faint"> · {n.updatedAt}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /subject/:slug/research */
export function Research() {
  const { slug = "" } = useParams();
  return (
    <div className="reader-screen">
      <ArtifactView slug={slug} relpath="research.md" title="Research" />
    </div>
  );
}

/** /subject/:slug/lesson/:file — `file` is the lesson filename under lessons/. */
export function Lesson() {
  const { slug = "", file = "" } = useParams();
  const navigate = useNavigate();
  const { data: lessons } = useLessons(slug);
  const del = useDeleteLesson(slug);
  const [confirming, setConfirming] = useState(false);

  // useParams already decodes the route segment; the Lessons list encodes it.
  const row = lessons?.find((l) => l.file === file);
  const moduleId = row?.moduleId ?? null;
  const mastered = row?.moduleStatus === "mastered";

  return (
    <div className="reader-screen">
      <div className="reader__header">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>Lesson</h1>
        <button
          className="btn btn--ghost"
          style={{ color: "var(--danger)" }}
          onClick={() => setConfirming(true)}
        >
          Delete lesson
        </button>
      </div>
      {del.isError && (
        <div className="muted" style={{ color: "var(--danger)", marginBottom: 10 }}>
          Could not delete: {String(del.error)}
        </div>
      )}
      <ArtifactView slug={slug} relpath={`lessons/${file}`} title="Lesson" />

      <LessonNotes slug={slug} moduleId={moduleId} />

      {confirming && (
        <ConfirmDestructive
          title="Delete this lesson?"
          body={
            moduleId
              ? "The lesson file is removed and its module is re-opened — the next step will re-deliver the lesson. Your mastery scores are kept. Existing reviews are not removed."
              : "This lesson isn’t tied to a module, so the file is just removed (re-teach can’t be armed)."
          }
          danger={
            mastered
              ? "This module is already mastered — re-teaching may change your mastery score when you next submit work."
              : undefined
          }
          confirmLabel={moduleId ? "Delete & re-open" : "Delete lesson"}
          busy={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            del.mutate(
              { moduleId: moduleId ?? "", file },
              {
                onSuccess: () => {
                  setConfirming(false);
                  navigate(`/subject/${slug}`);
                },
                // On error, stay put (the lesson may still exist) and surface it above.
                onError: () => setConfirming(false),
              },
            )
          }
        />
      )}
    </div>
  );
}

/** /subject/:slug/artifact/* — generic reader for any in-subject file (e.g. assignments/). */
export function Artifact() {
  const params = useParams();
  const slug = params.slug ?? "";
  const relpath = params["*"] ?? "";
  return (
    <div className="reader-screen">
      <ArtifactView slug={slug} relpath={relpath} title="Artifact" />
    </div>
  );
}
