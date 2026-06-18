import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalyticsView } from "../../routes/Analytics";
import type { AnalyticsReport } from "../../lib/types";

// Mirrors the Rust analytics output for golden.json (asserted in lyceum-core).
const report: AnalyticsReport = {
  subject: "Conversational Spanish",
  level: 2,
  target: 4,
  modulesTotal: 3,
  modulesMastered: 1,
  overallMastery: 0.765,
  calibration: { predictions: 12, hits: 7, accuracy: 7 / 12 },
  modules: [
    { moduleId: "m01", title: "Sound system & greetings", level: 1, status: "mastered", meanMastery: 0.91 },
    { moduleId: "m02", title: "Present tense", level: 2, status: "in-progress", meanMastery: 0.62 },
    { moduleId: "m03", title: "Past tense", level: 2, status: "locked", meanMastery: null },
  ],
  heatmap: [
    { moduleId: "m01", objectiveId: "m01-o1", mastery: 0.92 },
    { moduleId: "m01", objectiveId: "m01-o2", mastery: 0.9 },
    { moduleId: "m02", objectiveId: "m02-o1", mastery: 0.62 },
  ],
  review: { total: 3, due: 3, retired: 0, lapses: 1 },
  history: [
    { date: "2026-06-17", skill: "teach-lesson", event: "delivered m02", result: "ok" },
  ],
};

describe("AnalyticsView", () => {
  it("renders the reconciled stats, modules, heatmap and history", () => {
    render(<AnalyticsView report={report} />);
    const grid = screen.getByTestId("stat-grid");
    expect(grid).toHaveTextContent("1 / 3"); // modules mastered
    expect(grid).toHaveTextContent("7/12"); // calibration
    // heatmap has 3 objective cells across the modules.
    expect(screen.getByTestId("heatmap")).toBeInTheDocument();
    expect(screen.getByText(/delivered m02/)).toBeInTheDocument();
  });
});
