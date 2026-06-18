import type { AnalyticsReport } from "../lib/types";

function cellColor(mastery: number | null): string {
  if (mastery == null) return "var(--panel-3)";
  // Interpolate panel -> gold by mastery.
  const a = Math.max(0, Math.min(1, mastery));
  return `color-mix(in srgb, var(--gold) ${Math.round(a * 100)}%, var(--panel-2))`;
}

/** Per-objective mastery heatmap, grouped by module. */
export function MasteryHeatmap({ report }: { report: AnalyticsReport }) {
  const byModule = new Map<string, AnalyticsReport["heatmap"]>();
  for (const cell of report.heatmap) {
    const arr = byModule.get(cell.moduleId) ?? [];
    arr.push(cell);
    byModule.set(cell.moduleId, arr);
  }

  return (
    <div className="heatmap" data-testid="heatmap">
      {report.modules.map((m) => (
        <div className="heatmap__row" key={m.moduleId}>
          <div className="heatmap__label metric">{m.moduleId}</div>
          <div className="heatmap__cells">
            {(byModule.get(m.moduleId) ?? []).map((c) => (
              <span
                key={c.objectiveId}
                className="heatmap__cell"
                style={{ background: cellColor(c.mastery) }}
                title={`${c.objectiveId}: ${
                  c.mastery == null ? "unassessed" : `${Math.round(c.mastery * 100)}%`
                }`}
              />
            ))}
            {(byModule.get(m.moduleId) ?? []).length === 0 && (
              <span className="heatmap__empty faint">no objectives</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
