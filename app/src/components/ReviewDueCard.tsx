export function ReviewDueCard({
  totalDue,
  onReview,
}: {
  totalDue: number;
  onReview?: () => void;
}) {
  return (
    <div className="card review-due" data-testid="review-due">
      <div>
        <div className="dashboard__section-title">Spaced review</div>
        <div>
          <span className="review-due__count metric">{totalDue}</span>{" "}
          <span className="muted">item{totalDue === 1 ? "" : "s"} due today</span>
        </div>
      </div>
      <button
        className="btn btn--outline"
        disabled={totalDue === 0}
        onClick={onReview}
      >
        Review now
      </button>
    </div>
  );
}
