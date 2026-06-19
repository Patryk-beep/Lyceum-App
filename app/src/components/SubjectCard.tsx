import { phaseToStage, stageAccent } from "../theme/stages";
import type { SubjectSummary } from "../lib/types";
import { MasteryRing } from "./MasteryRing";
import { StageChip } from "./StageChip";

export function SubjectCard({
  summary,
  onOpen,
  onDelete,
}: {
  summary: SubjectSummary;
  onOpen?: (slug: string) => void;
  onDelete?: (slug: string) => void;
}) {
  const stage = phaseToStage(summary.phase);
  return (
    <div
      className="card subject-card"
      data-testid="subject-card"
      style={{ ["--accent" as string]: stageAccent(stage) }}
      onClick={() => onOpen?.(summary.slug)}
      role="button"
      tabIndex={0}
    >
      <div className="subject-card__accent" />
      {onDelete && (
        <button
          className="subject-card__delete"
          aria-label={`Delete ${summary.subject}`}
          title="Delete subject"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(summary.slug);
          }}
        >
          ✕
        </button>
      )}
      <MasteryRing value={summary.meanMastery} size={64} />
      <div className="subject-card__body">
        <div className="subject-card__title">{summary.subject}</div>
        <div className="subject-card__meta">
          <StageChip stage={stage} />
          <span className="metric">
            Level {summary.level} → {summary.target}
          </span>
          <span className="metric">
            {summary.modulesMastered} / {summary.modulesTotal} modules
          </span>
        </div>
        <div className="subject-card__next">Next: {summary.nextAction}</div>
        {summary.reviewsDue > 0 && (
          <div className="subject-card__due metric">
            {summary.reviewsDue} review{summary.reviewsDue === 1 ? "" : "s"} due
          </div>
        )}
      </div>
    </div>
  );
}
