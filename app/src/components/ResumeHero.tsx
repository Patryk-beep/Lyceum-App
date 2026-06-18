import { phaseToStage } from "../theme/stages";
import type { SubjectSummary } from "../lib/types";
import { MasteryRing } from "./MasteryRing";
import { StageChip } from "./StageChip";

export function ResumeHero({
  summary,
  onResume,
}: {
  summary: SubjectSummary;
  onResume?: (slug: string) => void;
}) {
  return (
    <div className="resume-hero" data-testid="resume-hero">
      <div>
        <div className="resume-hero__eyebrow">Resume learning</div>
        <div className="resume-hero__title">{summary.subject}</div>
        <div className="resume-hero__next">{summary.nextAction}</div>
        <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn--primary" onClick={() => onResume?.(summary.slug)}>
            Continue
          </button>
          <StageChip stage={phaseToStage(summary.phase)} />
        </div>
      </div>
      <div className="resume-hero__side">
        <MasteryRing value={summary.meanMastery} size={96} />
        <div className="faint metric" style={{ fontSize: 12 }}>
          Level {summary.level} of {summary.target}
        </div>
      </div>
    </div>
  );
}
