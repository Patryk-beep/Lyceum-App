import { useNavigate } from "react-router-dom";

import { ResumeHero } from "../components/ResumeHero";
import { ReviewDueCard } from "../components/ReviewDueCard";
import { StatGrid, type Stat } from "../components/StatGrid";
import { SubjectCard } from "../components/SubjectCard";
import { useSeedDemo, useSubjects } from "../lib/query";
import type { SubjectSummary } from "../lib/types";

function buildStats(subjects: SubjectSummary[]): Stat[] {
  const modulesMastered = subjects.reduce((n, s) => n + s.modulesMastered, 0);
  const modulesTotal = subjects.reduce((n, s) => n + s.modulesTotal, 0);
  const reviewsDue = subjects.reduce((n, s) => n + s.reviewsDue, 0);
  const assessed = subjects.filter((s) => s.meanMastery != null);
  const avg =
    assessed.length === 0
      ? null
      : assessed.reduce((n, s) => n + (s.meanMastery ?? 0), 0) / assessed.length;
  return [
    { label: "Subjects", value: subjects.length },
    { label: "Modules mastered", value: `${modulesMastered} / ${modulesTotal}` },
    { label: "Reviews due", value: reviewsDue },
    { label: "Avg mastery", value: avg == null ? "—" : `${Math.round(avg * 100)}%` },
  ];
}

/** Pure, presentational dashboard — unit-tested with fixture data. */
export function DashboardView({
  subjects,
  onOpenSubject,
  onReview,
  onSeedDemo,
  seeding = false,
}: {
  subjects: SubjectSummary[];
  onOpenSubject?: (slug: string) => void;
  onReview?: () => void;
  onSeedDemo?: () => void;
  seeding?: boolean;
}) {
  if (subjects.length === 0) {
    return (
      <div className="card empty-state" data-testid="empty-state">
        <div className="empty-state__title">No subjects yet</div>
        <p>Start a new subject, or load a sample course to explore the app.</p>
        <button
          className="btn btn--primary"
          onClick={onSeedDemo}
          disabled={seeding}
          style={{ marginTop: 12 }}
        >
          {seeding ? "Loading…" : "Load sample subject"}
        </button>
      </div>
    );
  }

  const totalReviewsDue = subjects.reduce((n, s) => n + s.reviewsDue, 0);
  const [resume, ...rest] = subjects;

  return (
    <div className="dashboard" data-testid="dashboard">
      <ResumeHero summary={resume} onResume={onOpenSubject} />
      <StatGrid stats={buildStats(subjects)} />
      <ReviewDueCard totalDue={totalReviewsDue} onReview={onReview} />
      <div>
        <div className="dashboard__section-title">Your subjects</div>
        <div className="subject-grid" style={{ marginTop: 12 }}>
          {[resume, ...rest].map((s) => (
            <SubjectCard key={s.slug} summary={s} onOpen={onOpenSubject} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Container — fetches subjects via Tauri and wires navigation. */
export function Dashboard() {
  const navigate = useNavigate();
  const { data: subjects, isLoading, error } = useSubjects();
  const seed = useSeedDemo();

  if (isLoading) {
    return <div className="muted">Loading your workspace…</div>;
  }
  if (error) {
    return <div className="muted">Could not load workspace: {String(error)}</div>;
  }

  return (
    <DashboardView
      subjects={subjects ?? []}
      onOpenSubject={(slug) => navigate(`/subject/${slug}`)}
      onReview={() => navigate("/review")}
      onSeedDemo={() => seed.mutate()}
      seeding={seed.isPending}
    />
  );
}
