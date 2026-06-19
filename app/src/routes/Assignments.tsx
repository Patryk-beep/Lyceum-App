import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ArtifactView } from "../components/ArtifactView";
import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { SubmissionEditor } from "../components/SubmissionEditor";
import { api } from "../lib/ipc";
import { useDeleteAssignment, useManifest, useSubmitAssignment } from "../lib/query";
import type { Assignment } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

/** Pure list of assignments with open + delete per row. */
export function AssignmentsView({
  slug,
  assignments,
  onDelete,
}: {
  slug: string;
  assignments: Assignment[];
  onDelete?: (assignment: Assignment) => void;
}) {
  if (assignments.length === 0) {
    return (
      <div className="muted" data-testid="assignments-empty">
        No assignments yet — they appear here once a module is taught.
      </div>
    );
  }
  return (
    <div className="artifact-list" data-testid="assignments-list">
      {assignments.map((a) => (
        <div className="card artifact-row" data-testid="assignment-row" key={a.id}>
          <div className="artifact-row__main">
            <div className="artifact-row__title">
              {a.id} · {a.type}
            </div>
            <div className="artifact-row__meta">
              {a.moduleId} · {a.status}
            </div>
          </div>
          <div className="artifact-row__actions">
            <Link
              className="btn btn--outline"
              data-testid="assignment-open"
              to={`/subject/${slug}/assignment/${a.id}`}
            >
              {a.status === "open"
                ? "Hand in"
                : a.status === "submitted"
                  ? "View · assess"
                  : "View feedback"}
            </Link>
            <button
              className="btn btn--ghost"
              style={{ color: "var(--danger)" }}
              data-testid="assignment-delete"
              onClick={() => onDelete?.(a)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** /subject/:slug/assignments */
export function Assignments() {
  const { slug = "" } = useParams();
  const { data: manifest, isLoading } = useManifest(slug);
  const del = useDeleteAssignment(slug);
  const [confirming, setConfirming] = useState<Assignment | null>(null);

  if (isLoading) return <div className="muted">Loading assignments…</div>;

  return (
    <div className="reader-screen">
      <h1 style={{ fontFamily: "var(--font-serif)", marginBottom: 4 }}>Assignments</h1>
      <AssignmentsView
        slug={slug}
        assignments={manifest?.assignments ?? []}
        onDelete={setConfirming}
      />
      {confirming && (
        <ConfirmDestructive
          title={`Delete assignment ${confirming.id}?`}
          body={`This removes the ${confirming.type} assignment file for ${confirming.moduleId} and clears its pending step. Mastery and reviews are unaffected.`}
          confirmLabel="Delete assignment"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            del.mutate(confirming.id, { onSettled: () => setConfirming(null) })
          }
        />
      )}
    </div>
  );
}

/** /subject/:slug/assignment/:id — read the brief, hand work in, or view feedback. */
export function AssignmentDetail() {
  const { slug = "", id = "" } = useParams();
  const qc = useQueryClient();
  const { data: manifest, isLoading } = useManifest(slug);
  const submit = useSubmitAssignment(slug);
  const engineStart = useEngineStore((s) => s.start);

  // Grading reuses the engine: submit flips status -> submitted, then running the
  // next step routes to assess-understanding (mirrors the Roadmap/Capstone pattern).
  const assess = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(),
    onSuccess: () => {
      for (const key of ["manifest", "subjects", "analytics", "review", "artifact"]) {
        qc.invalidateQueries({ queryKey: key === "subjects" ? [key] : [key, slug] });
      }
    },
  });

  if (isLoading || !manifest) return <div className="muted">Loading…</div>;

  const a = manifest.assignments.find((x) => x.id === id);
  if (!a) {
    return (
      <div className="reader-screen">
        <div className="muted" data-testid="assignment-missing">
          That assignment no longer exists.{" "}
          <Link to={`/subject/${slug}/assignments`}>Back to assignments</Link>
        </div>
      </div>
    );
  }

  const onCurrentModule = manifest.current.moduleId === a.moduleId;
  const busy = submit.isPending || assess.isPending;

  return (
    <div className="reader-screen">
      <div className="reader__header">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20 }}>
          {a.id} · {a.type}
        </h1>
        <Link className="btn btn--ghost" to={`/subject/${slug}/assignments`}>
          All assignments
        </Link>
      </div>

      <ArtifactView slug={slug} relpath={a.file} title="Assignment brief" />

      {submit.isError && (
        <div className="muted" style={{ color: "var(--danger)", marginTop: 10 }}>
          Could not submit: {String(submit.error)}
        </div>
      )}

      {a.status === "open" && onCurrentModule && (
        <section className="submission-section" data-testid="submission-section">
          <h2 className="submission-section__title">Your hand-in</h2>
          <SubmissionEditor
            inputType={a.inputType}
            options={a.options}
            language={a.language}
            busy={busy}
            onSubmit={(content) =>
              submit.mutate(
                { assignmentId: a.id, content },
                { onSuccess: () => assess.mutate() },
              )
            }
          />
        </section>
      )}

      {a.status === "open" && !onCurrentModule && (
        <div
          className="muted"
          data-testid="submission-locked"
          style={{ marginTop: 14 }}
        >
          This assignment is on {a.moduleId}, not your current module — it won’t be
          auto-assessed until you’re back on it. Finish your current step first.
        </div>
      )}

      {a.status === "submitted" && (
        <section className="submission-section" data-testid="submission-submitted">
          <h2 className="submission-section__title">Submitted — awaiting assessment</h2>
          {a.submissionFile && (
            <ArtifactView slug={slug} relpath={a.submissionFile} title="Your submission" />
          )}
          <button
            className="btn btn--primary"
            disabled={assess.isPending}
            onClick={() => assess.mutate()}
            style={{ marginTop: 12 }}
          >
            {assess.isPending ? "Assessing…" : "Run assessment"}
          </button>
        </section>
      )}

      {a.status === "graded" && (
        <section className="submission-section" data-testid="submission-graded">
          <h2 className="submission-section__title">
            Graded — feedback is in the brief above
          </h2>
          {a.submissionFile && (
            <ArtifactView slug={slug} relpath={a.submissionFile} title="Your submission" />
          )}
        </section>
      )}
    </div>
  );
}
