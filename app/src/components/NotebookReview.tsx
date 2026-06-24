import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/ipc";
import { useNotebookCardsDue } from "../lib/query";
import type { ReviewGrade } from "../lib/types";
import { ReviewView } from "../routes/Review";

/** Flashcard review over a subject's notebook cards (the separate cloze-card
 *  store). Reuses the spaced-review queue UI; grading persists schedule-only and
 *  never touches the manifest. */
export function NotebookReview({
  slug,
  onExit,
}: {
  slug: string;
  onExit: () => void;
}) {
  const qc = useQueryClient();
  const { data: cards, isLoading } = useNotebookCardsDue(slug);

  // Persist-only: do NOT invalidate the loaded batch (ReviewView steps through it
  // in memory); just refresh the due-count badge.
  const grade = useMutation({
    mutationFn: ({ itemId, grade }: { itemId: string; grade: ReviewGrade }) =>
      api.notebookReviewGrade(slug, itemId, grade),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notebookDueCount", slug] });
    },
  });

  return (
    <div className="notebook__review" data-testid="notebook-review">
      <button className="btn btn--ghost" onClick={onExit} data-testid="notebook-review-exit">
        ← Back to notes
      </button>
      {isLoading ? (
        <div className="muted">Loading cards…</div>
      ) : (
        <ReviewView
          slug={slug}
          cards={cards ?? []}
          onGrade={(_s, itemId, g) => grade.mutate({ itemId, grade: g })}
        />
      )}
    </div>
  );
}
