/** Linear mastery meter with a gate marker at the module's threshold. */
export function MasteryMeter({
  value,
  threshold,
}: {
  value: number | null;
  threshold?: number;
}) {
  const fraction = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="mastery-meter" data-testid="mastery-meter">
      <div
        className="mastery-meter__fill"
        style={{ width: `${fraction * 100}%` }}
      />
      {threshold != null && (
        <div
          className="mastery-meter__gate"
          style={{ left: `${Math.min(1, threshold) * 100}%` }}
          aria-label={`gate ${Math.round(threshold * 100)}%`}
        />
      )}
    </div>
  );
}
