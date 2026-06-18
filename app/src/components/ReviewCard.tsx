import { useState } from "react";

import type { ReviewCandidate, ReviewGrade } from "../lib/types";

const GRADES: { key: ReviewGrade; label: string }[] = [
  { key: "again", label: "Again" },
  { key: "hard", label: "Hard" },
  { key: "good", label: "Good" },
  { key: "easy", label: "Easy" },
];

function days(n: number): string {
  return n === 1 ? "1d" : `${n}d`;
}

/** One spaced-review card: recall → reveal → grade. Intervals come from Rust. */
export function ReviewCard({
  card,
  onGrade,
}: {
  card: ReviewCandidate;
  onGrade: (grade: ReviewGrade) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="card review-card" data-testid="review-card">
      <div className="review-card__band">Review · box {card.boxNum ?? "–"}</div>
      <div className="review-card__prompt">{card.prompt}</div>

      {!revealed ? (
        <button
          className="btn btn--outline"
          onClick={() => setRevealed(true)}
          data-testid="reveal"
        >
          Show answer
        </button>
      ) : (
        <>
          <div className="review-card__answer" data-testid="answer">
            {card.answer}
          </div>
          <div className="review-card__grades">
            {GRADES.map((g) => (
              <button
                key={g.key}
                className="btn btn--outline review-card__grade"
                onClick={() => onGrade(g.key)}
              >
                {g.label}
                <span className="review-card__interval metric">
                  {days(card.preview[g.key])}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
