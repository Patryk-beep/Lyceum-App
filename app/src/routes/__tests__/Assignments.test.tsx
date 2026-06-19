import { render, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AssignmentsView } from "../Assignments";
import type { Assignment } from "../../lib/types";

const assignments: Assignment[] = [
  {
    id: "a02",
    moduleId: "m02",
    type: "guided-practice",
    file: "assignments/02-m02-guided-practice.md",
    objectives: ["m02-o1"],
    status: "open",
  },
];

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("AssignmentsView", () => {
  it("renders a row per assignment and deletes by id", () => {
    const onDelete = vi.fn();
    renderView(<AssignmentsView slug="s" assignments={assignments} onDelete={onDelete} />);
    const row = screen.getByTestId("assignment-row");
    expect(row).toHaveTextContent("a02");
    expect(row).toHaveTextContent("guided-practice");
    within(row).getByTestId("assignment-delete").click();
    expect(onDelete).toHaveBeenCalledWith(assignments[0]);
  });

  it("shows an empty state when there are no assignments", () => {
    renderView(<AssignmentsView slug="s" assignments={[]} />);
    expect(screen.getByTestId("assignments-empty")).toBeInTheDocument();
  });
});
