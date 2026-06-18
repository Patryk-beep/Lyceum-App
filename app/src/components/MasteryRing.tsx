/** Conic-gradient mastery ring. `value` is 0..1, or null when unassessed (shows —). */
export function MasteryRing({
  value,
  size = 72,
}: {
  value: number | null;
  size?: number;
}) {
  const fraction = value ?? 0;
  const deg = Math.max(0, Math.min(1, fraction)) * 360;
  const label = value == null ? "—" : `${Math.round(value * 100)}%`;
  return (
    <div
      className="mastery-ring"
      data-testid="mastery-ring"
      aria-label={`mastery ${label}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--gold) ${deg}deg, var(--line) ${deg}deg)`,
      }}
    >
      <div className="mastery-ring__hole">
        <span className="mastery-ring__value">{label}</span>
      </div>
    </div>
  );
}
