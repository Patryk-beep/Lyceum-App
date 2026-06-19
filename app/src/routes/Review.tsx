import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { ReviewCard } from "../components/ReviewCard";
import { api } from "../lib/ipc";
import { useReviewDue, useSubjects } from "../lib/query";
import type { ReviewCandidate, ReviewGrade } from "../lib/types";

/** Presentational review queue — steps through the due cards. */
export function ReviewView({
  slug,
  cards,
  onGrade,
}: {
  slug: string;
  cards: ReviewCandidate[];
  onGrade: (slug: string, itemId: string, grade: ReviewGrade) => void;
}) {
  const [index, setIndex] = useState(0);

  if (cards.length === 0) {
    return (
      <div className="card empty-state" data-testid="review-empty">
        <div className="empty-state__title">All caught up</div>
        <p>No reviews are due right now. Spacing is working.</p>
      </div>
    );
  }

  const card = cards[Math.min(index, cards.length - 1)];
  const done = index >= cards.length;

  if (done) {
    return (
      <div className="card empty-state" data-testid="review-done">
        <div className="empty-state__title">Review complete</div>
        <p>You worked through {cards.length} card(s).</p>
      </div>
    );
  }

  return (
    <div className="review-screen" data-testid="review-screen">
      <div className="dashboard__section-title">
        Spaced review — {index + 1} / {cards.length}
      </div>
      <ReviewCard
        key={card.itemId}
        card={card}
        onGrade={(grade) => {
          onGrade(slug, card.itemId, grade);
          setIndex((i) => i + 1);
        }}
      />
    </div>
  );
}

/** Container — scoped to `:slug` when reached from a subject; otherwise a global
 *  queue with an explicit subject picker (no silent first-subject default). */
export function Review() {
  const params = useParams();
  const qc = useQueryClient();
  const { data: subjects, isLoading: subjectsLoading } = useSubjects();
  const [picked, setPicked] = useState<string | null>(null);

  const fallback =
    subjects?.find((s) => s.reviewsDue > 0)?.slug ?? subjects?.[0]?.slug ?? "";
  const slug = params.slug ?? picked ?? fallback;
  const { data: cards, isLoading } = useReviewDue(slug);

  const grade = useMutation({
    mutationFn: ({ itemId, grade }: { itemId: string; grade: ReviewGrade }) =>
      api.reviewGrade(slug, itemId, grade),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
    },
  });

  if (!slug && subjectsLoading) return <div className="muted">Loading…</div>;
  if (!slug) return <div className="muted">No subjects yet.</div>;

  const showPicker = !params.slug && (subjects?.length ?? 0) > 1;

  return (
    <div className="review-screen">
      {showPicker && (
        <label className="subject-picker">
          <span className="dashboard__section-title">Subject</span>
          <select
            className="wizard__input"
            value={slug}
            onChange={(e) => setPicked(e.target.value)}
            data-testid="review-subject-picker"
          >
            {subjects!.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.subject}
                {s.reviewsDue ? ` (${s.reviewsDue} due)` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {isLoading ? (
        <div className="muted">Loading reviews…</div>
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
