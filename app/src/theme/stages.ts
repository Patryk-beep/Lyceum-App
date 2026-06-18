// The single phase -> stage -> accent map. Components import from here so the
// stage colours stay consistent across Dashboard, Roadmap, and the live console.

export type StageKey =
  | "research"
  | "curriculum"
  | "teach"
  | "assign"
  | "assess"
  | "review"
  | "capstone";

export const STAGE_LABELS: Record<StageKey, string> = {
  research: "Research",
  curriculum: "Curriculum",
  teach: "Teach",
  assign: "Assign",
  assess: "Assess",
  review: "Review",
  capstone: "Capstone",
};

/** CSS custom property reference for a stage accent colour. */
export function stageAccent(stage: StageKey): string {
  return `var(--stage-${stage})`;
}

/** Map a manifest `current.phase` to a stage. */
export function phaseToStage(phase: string): StageKey {
  switch (phase) {
    case "teach":
      return "teach";
    case "assign":
    case "remediate":
      return "assign";
    case "assess":
      return "assess";
    case "capstone":
      return "capstone";
    default:
      return "teach";
  }
}

/** Map a route DTO `kind` to a stage (used by the live session surface). */
export function routeKindToStage(kind: string): StageKey {
  switch (kind) {
    case "research":
      return "research";
    case "buildCurriculum":
      return "curriculum";
    case "teach":
      return "teach";
    case "createAssignment":
    case "completeAssignment":
      return "assign";
    case "assess":
      return "assess";
    case "capstone":
    case "courseComplete":
      return "capstone";
    default:
      return "teach";
  }
}
