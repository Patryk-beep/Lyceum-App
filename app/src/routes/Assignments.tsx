import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { useDeleteAssignment, useManifest } from "../lib/query";
import type { Assignment } from "../lib/types";

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
            <Link className="btn btn--outline" to={`/subject/${slug}/artifact/${a.file}`}>
              Open
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
