import { STAGE_LABELS, stageAccent, type StageKey } from "../theme/stages";

export function StageChip({ stage }: { stage: StageKey }) {
  return (
    <span
      className="stage-chip"
      style={{ ["--chip" as string]: stageAccent(stage) }}
    >
      <span className="stage-chip__dot" />
      {STAGE_LABELS[stage]}
    </span>
  );
}
