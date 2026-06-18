import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

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

/** Container — reviews the first subject with due items (cross-subject in M3). */
export function Review() {
  const qc = useQueryClient();
  const { data: subjects } = useSubjects();
  const slug =
    subjects?.find((s) => s.reviewsDue > 0)?.slug ?? subjects?.[0]?.slug ?? "";
  const { data: cards, isLoading } = useReviewDue(slug);

  const grade = useMutation({
    mutationFn: ({ itemId, grade }: { itemId: string; grade: ReviewGrade }) =>
      api.reviewGrade(slug, itemId, grade),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
    },
  });

  if (!slug) return <div className="muted">No subjects yet.</div>;
  if (isLoading) return <div className="muted">Loading reviews…</div>;

  return (
    <ReviewView
      slug={slug}
      cards={cards ?? []}
      onGrade={(_s, itemId, g) => grade.mutate({ itemId, grade: g })}
    />
  );
}
