import type { Objective } from "../lib/types";

/** Shown above the Roadmap's run button when the next step is remediation: a calm, encouraging
 *  frame plus the specific objectives that didn't land yet. Advisory — the engine re-derives
 *  the route when the step actually runs, so this reflects the latest computed step, not a
 *  promise. Render only when there is at least one weak objective. */
export function RemediationNotice({ objectives }: { objectives: Objective[] }) {
  return (
    <div
      className="remediation-notice card"
      data-testid="remediation-notice"
      role="note"
    >
      <div className="remediation-notice__title">Let’s revisit the tricky parts</div>
      <p className="remediation-notice__body">
        The last check showed a few things still need another pass. We’ll re-explain these a
        different way, then give you fresh practice — no penalty, just another run at it.
      </p>
      {objectives.length > 0 && (
        <ul className="remediation-notice__list">
          {objectives.map((o) => (
            <li key={o.id}>{o.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
