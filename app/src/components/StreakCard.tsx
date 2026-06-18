/** Sidebar "Days at Study" streak card (token-only). Hidden when the streak is 0. */
export function StreakCard({ days }: { days: number }) {
  if (days <= 0) return null;
  return (
    <div className="streak-card" data-testid="streak-card">
      <div className="streak-card__eyebrow">Days at Study</div>
      <div className="streak-card__count metric">{days}</div>
      <div className="streak-card__note">unbroken</div>
    </div>
  );
}
