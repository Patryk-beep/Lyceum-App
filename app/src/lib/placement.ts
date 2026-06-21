import type { PlacementQuestion, PlacementState } from "./types";

/**
 * Parse the skill-owned `placement-state.json` tolerantly. It is written by an LLM each
 * turn, which drifts from the documented schema — observed live: `current.prompt` instead
 * of `current.question`, and `lastFeedback` nested inside `current`. A brittle
 * `JSON.parse(...) as PlacementState` silently blanks the whole question on any such slip.
 * Normalize here so the UI always renders what the skill meant. ponytail: tolerant reader
 * at the trust boundary beats fighting LLM field-name drift.
 */
export function parsePlacementState(raw: string): PlacementState | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;

  const c = o.current as Record<string, unknown> | null | undefined;
  const current: PlacementQuestion | null =
    c && typeof c === "object"
      ? {
          id: String(c.id ?? ""),
          tier: typeof c.tier === "number" ? c.tier : undefined,
          // accept question | prompt | text — the skill has used all three
          question: String(c.question ?? c.prompt ?? c.text ?? ""),
        }
      : null;

  return {
    asked: Number(o.asked ?? 0),
    maxQuestions: Number(o.maxQuestions ?? 8),
    current,
    lastFeedback: (o.lastFeedback ?? c?.lastFeedback ?? null) as string | null,
    history: Array.isArray(o.history) ? (o.history as PlacementState["history"]) : [],
    done: Boolean(o.done),
    recommendedLevel: (o.recommendedLevel ?? null) as number | null,
    rationale: (o.rationale ?? null) as string | null,
  };
}
