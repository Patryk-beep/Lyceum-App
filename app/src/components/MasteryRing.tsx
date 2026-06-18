/** Conic-gradient mastery ring. `value` is 0..1, or null when unassessed (shows —).
 *
 * `dial` opts into the Aurelia "gilt dial" framing (inner disc + a small caption);
 * it defaults to the legacy ring so every existing caller/test is unchanged. In
 * BOTH modes the root keeps `data-testid="mastery-ring"`, the `mastery-ring` class,
 * the `aria-label`, the sized box, and the value/em-dash as a real text node. */
export function MasteryRing({
  value,
  size = 72,
  dial = false,
  label,
}: {
  value: number | null;
  size?: number;
  dial?: boolean;
  label?: string;
}) {
  const fraction = value ?? 0;
  const deg = Math.max(0, Math.min(1, fraction)) * 360;
  const valueText = value == null ? "—" : `${Math.round(value * 100)}%`;
  return (
    <div
      className="mastery-ring"
      data-testid="mastery-ring"
      aria-label={`mastery ${valueText}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--gold) ${deg}deg, var(--line) ${deg}deg)`,
      }}
    >
      {dial ? (
        <div className="mastery-ring__disc">
          <span className="mastery-ring__value">{valueText}</span>
          {label && <span className="mastery-ring__label">{label}</span>}
        </div>
      ) : (
        <div className="mastery-ring__hole">
          <span className="mastery-ring__value">{valueText}</span>
        </div>
      )}
    </div>
  );
}
