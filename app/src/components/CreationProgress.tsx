import type { EngineStatus } from "../stores/useEngineStore";

const GLYPH = { done: "✓", current: "●", todo: "○" } as const;

export type CreationStepStatus = keyof typeof GLYPH;

export interface CreationStep {
  id: string;
  label: string;
}

/** The ordered creation steps for the wizard. A `test` start ends at placement: the
 *  creation turn stops after the first placement question lands, and the learner
 *  answers it interactively on the placement screen — the curriculum is built later,
 *  after placement finalizes, so it is NOT part of creation. A fixed-level start
 *  skips placement and builds the curriculum during creation. */
export function creationSteps(start: string): CreationStep[] {
  const steps: CreationStep[] = [
    { id: "research", label: "Researching the subject" },
  ];
  if (start === "test") {
    steps.push({ id: "placement", label: "Preparing your placement test" });
  } else {
    steps.push({ id: "curriculum", label: "Building the curriculum" });
  }
  steps.push({ id: "finishing", label: "Finishing setup" });
  return steps;
}

/** Resolve each step's status from the milestones seen so far + the run status.
 *  A step is `done` once its milestone arrived (`finishing` completes when the
 *  turn ends); the first not-done step is `current` while the turn runs. */
export function stepStatuses(
  steps: CreationStep[],
  done: string[],
  status: EngineStatus,
): CreationStepStatus[] {
  const isDone = (id: string) =>
    id === "finishing" ? status === "done" : done.includes(id);
  let currentMarked = false;
  return steps.map((s) => {
    if (isDone(s.id)) return "done";
    if (!currentMarked && status === "running") {
      currentMarked = true;
      return "current";
    }
    return "todo";
  });
}

export function CreationProgress({
  start,
  done,
  status,
}: {
  start: string;
  done: string[];
  status: EngineStatus;
}) {
  const steps = creationSteps(start);
  const statuses = stepStatuses(steps, done, status);
  return (
    <ol className="creation-progress" data-testid="creation-progress" role="list">
      {steps.map((s, i) => {
        const st = statuses[i];
        return (
          <li
            key={s.id}
            className="creation-progress__row"
            data-step={s.id}
            data-status={st}
            aria-current={st === "current" ? "step" : undefined}
          >
            <span
              className={`creation-progress__glyph creation-progress__glyph--${st}`}
              aria-hidden="true"
            >
              {GLYPH[st]}
            </span>
            <span className="creation-progress__label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
