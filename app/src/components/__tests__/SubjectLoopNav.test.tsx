import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SubjectLoopNav } from "../SubjectLoopNav";
import type { LoopStage } from "../../theme/loop";

const stages: LoopStage[] = [
  { key: "research", label: "Research", seg: "research", status: "done" },
  { key: "placement", label: "Placement", seg: "placement", status: "done" },
  { key: "lessons", label: "Lessons", seg: "lessons", status: "current" },
  { key: "assignments", label: "Assignments", seg: "assignments", status: "todo" },
  { key: "review", label: "Review", seg: "review", status: "todo", badge: 3 },
  { key: "capstone", label: "Capstone", seg: "capstone", status: "todo" },
];

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("SubjectLoopNav", () => {
  it("renders one linked row per stage with its journey status", () => {
    renderView(<SubjectLoopNav slug="spanish" stages={stages} activeKey="lessons" />);
    const research = screen.getByTestId("loop-research");
    expect(research).toHaveAttribute("href", "/subject/spanish/research");
    expect(research.dataset.status).toBe("done");
    expect(screen.getByTestId("loop-lessons").dataset.status).toBe("current");
  });

  it("marks the current page (not the current stage) with aria-current", () => {
    renderView(<SubjectLoopNav slug="spanish" stages={stages} activeKey="lessons" />);
    expect(screen.getByTestId("loop-lessons")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("loop-research")).not.toHaveAttribute("aria-current");
  });

  it("badges the review row with the due count", () => {
    renderView(<SubjectLoopNav slug="spanish" stages={stages} activeKey={null} />);
    expect(screen.getByTestId("loop-review")).toHaveTextContent("3");
  });
});
