import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CreationProgress,
  creationSteps,
  stepStatuses,
} from "../CreationProgress";

describe("creationSteps", () => {
  it("ends at placement for a test start (curriculum is built later)", () => {
    expect(creationSteps("test").map((s) => s.id)).toEqual([
      "research",
      "placement",
      "finishing",
    ]);
    expect(creationSteps("3").map((s) => s.id)).toEqual([
      "research",
      "curriculum",
      "finishing",
    ]);
  });
});

describe("stepStatuses", () => {
  const steps = creationSteps("test"); // [research, placement, finishing]

  it("marks the first incomplete step current while running", () => {
    expect(stepStatuses(steps, [], "running")).toEqual([
      "current",
      "todo",
      "todo",
    ]);
  });

  it("advances as milestones arrive", () => {
    expect(stepStatuses(steps, ["research"], "running")).toEqual([
      "done",
      "current",
      "todo",
    ]);
    expect(stepStatuses(steps, ["research", "placement"], "running")).toEqual([
      "done",
      "done",
      "current",
    ]);
  });

  it("completes finishing only when the turn is done", () => {
    expect(stepStatuses(steps, ["research", "placement"], "done")).toEqual([
      "done",
      "done",
      "done",
    ]);
  });
});

describe("<CreationProgress>", () => {
  it("renders ✓ for a reached milestone and aria-current on the active step", () => {
    render(
      <CreationProgress start="test" done={["research"]} status="running" />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    const research = rows.find((r) => r.dataset.step === "research")!;
    expect(research.dataset.status).toBe("done");

    const placement = rows.find((r) => r.dataset.step === "placement")!;
    expect(placement.getAttribute("aria-current")).toBe("step");
  });

  it("omits the placement step for a fixed-level start", () => {
    render(<CreationProgress start="3" done={[]} status="running" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Preparing your placement test")).toBeNull();
  });
});
