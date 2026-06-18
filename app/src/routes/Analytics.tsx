import { useParams } from "react-router-dom";

import { MasteryHeatmap } from "../components/MasteryHeatmap";
import { MasteryMeter } from "../components/MasteryMeter";
import { StatGrid } from "../components/StatGrid";
import { useAnalytics, useSubjects } from "../lib/query";
import type { AnalyticsReport } from "../lib/types";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export function AnalyticsView({ report }: { report: AnalyticsReport }) {
  return (
    <div className="analytics" data-testid="analytics">
      <h1>{report.subject} — analytics</h1>

      <StatGrid
        stats={[
          { label: "Overall mastery", value: pct(report.overallMastery) },
          {
            label: "Modules mastered",
            value: `${report.modulesMastered} / ${report.modulesTotal}`,
          },
          {
            label: "Calibration",
            value:
              report.calibration.accuracy == null
                ? "—"
                : `${report.calibration.hits}/${report.calibration.predictions}`,
          },
          { label: "Reviews due", value: report.review.due },
        ]}
      />

      <section style={{ marginTop: 22 }}>
        <div className="dashboard__section-title">Mastery by module</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {report.modules.map((m) => (
            <div key={m.moduleId}>
              <div className="analytics__module-row metric">
                <span>
                  {m.moduleId} — {m.title}
                </span>
                <span className="muted">{pct(m.meanMastery)}</span>
              </div>
              <MasteryMeter value={m.meanMastery} />
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="dashboard__section-title">Objective heatmap</div>
        <div style={{ marginTop: 10 }}>
          <MasteryHeatmap report={report} />
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="dashboard__section-title">Recent activity</div>
        <ul className="analytics__history">
          {report.history.map((h, i) => (
            <li key={i}>
              <span className="metric faint">{h.date}</span> · {h.skill} — {h.event}
              {h.result ? ` → ${h.result}` : ""}
            </li>
          ))}
          {report.history.length === 0 && <li className="muted">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}

export function Analytics() {
  const params = useParams();
  const { data: subjects } = useSubjects();
  const slug = params.slug ?? subjects?.[0]?.slug ?? "";
  const { data: report, isLoading } = useAnalytics(slug);

  if (!slug) return <div className="muted">No subjects yet.</div>;
  if (isLoading || !report) return <div className="muted">Loading analytics…</div>;
  return <AnalyticsView report={report} />;
}
