import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { lastSubject, resumeRoute } from "../hooks/useResumeState";
import { ResumeHero } from "../components/ResumeHero";
import { ReviewDueCard } from "../components/ReviewDueCard";
import { SectionDivider } from "../components/SectionDivider";
import { Sigil } from "../components/Sigil";
import { StatGrid, type Stat } from "../components/StatGrid";
import { SubjectCard } from "../components/SubjectCard";
import { useDeleteSubject, useSeedDemo, useSubjects } from "../lib/query";
import type { SubjectSummary } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

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
  onDeleteSubject,
  seeding = false,
}: {
  subjects: SubjectSummary[];
  onOpenSubject?: (slug: string) => void;
  onReview?: () => void;
  onSeedDemo?: () => void;
  onDeleteSubject?: (slug: string) => void;
  seeding?: boolean;
}) {
  if (subjects.length === 0) {
    return (
      <div className="card empty-state empty-state--cover" data-testid="empty-state">
        <Sigil size={132} />
        <div className="empty-state__wordmark">LYCEUM</div>
        <SectionDivider label="Per Studium · Ad Gloriam" />
        <div className="empty-state__title">Begin your first work</div>
        <p>
          Each subject begins as pale marble; with every mastered rite it takes its
          gold — until it gleams, a finished treasure, and yours.
        </p>
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
        <SectionDivider label="Your subjects" />
        <div className="subject-grid" style={{ marginTop: 12 }}>
          {/* The grid lists every subject; delete lives on the card (the hero is a
              pure CTA), so each subject has exactly one delete affordance. */}
          {[resume, ...rest].map((s) => (
            <SubjectCard
              key={s.slug}
              summary={s}
              onOpen={onOpenSubject}
              onDelete={onDeleteSubject}
            />
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
  const del = useDeleteSubject();
  const [confirming, setConfirming] = useState<SubjectSummary | null>(null);

  if (isLoading) {
    return <div className="muted">Loading your workspace…</div>;
  }
  if (error) {
    return <div className="muted">Could not load workspace: {String(error)}</div>;
  }

  const list = subjects ?? [];

  // Float the most-recently-touched subject to the hero so "Continue" resumes the
  // last thing you were doing (NN/G: highest-leverage move for short, frequent use).
  const last = lastSubject();
  const i = last ? list.findIndex((s) => s.slug === last) : -1;
  const ordered =
    i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;

  return (
    <>
      <DashboardView
        subjects={ordered}
        onOpenSubject={(slug) => navigate(resumeRoute(slug))}
        onReview={() => navigate("/review")}
        onSeedDemo={() => seed.mutate()}
        onDeleteSubject={(slug) =>
          setConfirming(list.find((s) => s.slug === slug) ?? null)
        }
        seeding={seed.isPending}
      />
      {confirming && (
        <ConfirmDestructive
          title={`Delete “${confirming.subject}”?`}
          body="This removes all lessons, assignments, reviews and progress for this subject."
          danger="This cannot be undone."
          confirmWord={confirming.slug}
          confirmLabel="Delete subject"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            del.mutate(confirming.slug, {
              onSuccess: () => {
                // The deleted subject's warm session is gone — clear stale engine UI.
                useEngineStore.getState().reset();
                setConfirming(null);
              },
            })
          }
        />
      )}
    </>
  );
}
