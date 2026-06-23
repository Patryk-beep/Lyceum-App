/** Sidebar "Days at Study" streak card. Hidden when the streak is 0. The week-dots
 *  light the trailing min(days, 7) of 7 — a playful read-out derived straight from the
 *  streak count (no extra data, no persistence). */
export function StreakCard({ days }: { days: number }) {
  if (days <= 0) return null;
  const lit = Math.min(days, 7);
  return (
    <div className="streak-card" data-testid="streak-card">
      <div className="streak-card__eyebrow">Days at Study</div>
      <div className="streak-card__count metric">{days}</div>
      <div className="streak-card__note">unbroken</div>
      <div className="streak-card__dots" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={
              "streak-card__dot" + (i >= 7 - lit ? " streak-card__dot--on" : "")
            }
          />
        ))}
      </div>
    </div>
  );
}
