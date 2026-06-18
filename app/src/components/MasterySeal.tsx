export type SealState = "earned" | "active" | "available" | "locked";

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

/** Roadmap node marker. The root span keeps `data-testid="mastery-seal"` and the
 * RAW `data-state` (the SealState string) so existing tests are unaffected; the
 * gilded medallion (earned) / marble lock (locked) render as child nodes. The
 * earned glyph is dark ink (never white — white fails contrast on gold). */
export function MasterySeal({ state }: { state: SealState }) {
  return (
    <span
      className={`mastery-seal mastery-seal--${state}`}
      data-testid="mastery-seal"
      data-state={state}
    >
      {state === "earned" && <span className="mastery-seal__glyph">✦</span>}
      {state === "locked" && <LockGlyph />}
    </span>
  );
}
