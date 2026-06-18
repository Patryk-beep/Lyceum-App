export type SealState = "earned" | "active" | "available" | "locked";

/** Roadmap node marker: earned gold seal, pulsing active ring, or dashed lock. */
export function MasterySeal({ state }: { state: SealState }) {
  return (
    <span
      className={`mastery-seal mastery-seal--${state}`}
      data-testid="mastery-seal"
      data-state={state}
    >
      {state === "earned" ? "✦" : state === "locked" ? "🔒" : ""}
    </span>
  );
}
