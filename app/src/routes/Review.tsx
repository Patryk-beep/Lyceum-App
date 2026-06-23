import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { ReviewCard } from "../components/ReviewCard";
import { api } from "../lib/ipc";
import { useReviewDue, useSubjects } from "../lib/query";
import type { ReviewCandidate, ReviewGrade } from "../lib/types";

// Deterministic confetti burst (no Math.random — stable in tests/SSR). Colours ride
// the theme tokens so each variant celebrates in its own palette.
const CONFETTI_COLORS = [
  "var(--gold)",
  "var(--amber, var(--gold))",
  "var(--stage-research)",
  "var(--stage-assign)",
  "var(--stage-capstone)",
];
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 13 + 6) % 96}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  dur: `${1.2 + (i % 4) * 0.2}s`,
  delay: `${(i % 5) * 0.08}s`,
}));

/** Presentational review queue — steps through the due cards, tracking an in-session
 *  "combo" (consecutive recalled cards). The combo and the completion celebration are
 *  purely ephemeral — no XP, no persistence. */
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
  const [combo, setCombo] = useState(0);

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
      <div className="card empty-state review-done" data-testid="review-done">
        <div className="review-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                left: c.left,
                background: c.color,
                animationDuration: c.dur,
                animationDelay: c.delay,
              }}
            />
          ))}
        </div>
        <div className="empty-state__title">Session complete!</div>
        <div className="review-done__count metric">{cards.length}</div>
        <p>card{cards.length === 1 ? "" : "s"} cleared — spacing locked in.</p>
      </div>
    );
  }

  return (
    <div className="review-screen" data-testid="review-screen">
      <div className="review-screen__topline">
        <div className="dashboard__section-title">
          Spaced review — {index + 1} / {cards.length}
        </div>
        {combo >= 2 && (
          <span className="review-combo" data-testid="review-combo">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2c2.4 3.4 4.8 5.6 4.8 9A4.8 4.8 0 0 1 7.2 11c0-1 .3-1.9.9-2.7.4 1.1 1.1 1.7 1.9 1.8C11 8.4 10 6 12 2z" />
            </svg>
            {combo} in a row
          </span>
        )}
      </div>
      <ReviewCard
        key={card.itemId}
        card={card}
        onGrade={(grade) => {
          onGrade(slug, card.itemId, grade);
          setCombo((c) => (grade === "again" ? 0 : c + 1));
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
