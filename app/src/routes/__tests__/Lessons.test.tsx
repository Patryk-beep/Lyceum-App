import { render, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LessonsView } from "../Lessons";
import type { LessonEntry } from "../../lib/types";

const lessons: LessonEntry[] = [
  { file: "01-m01-greetings.md", moduleId: "m01", moduleStatus: "mastered", title: "Greetings" },
  { file: "02-m02-present.md", moduleId: "m02", moduleStatus: "in-progress", title: "Present tense" },
];

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("LessonsView", () => {
  it("renders a row per lesson and deletes with the resolved entry (authoritative id)", () => {
    const onDelete = vi.fn();
    renderView(<LessonsView slug="s" lessons={lessons} onDelete={onDelete} />);
    const rows = screen.getAllByTestId("lesson-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Greetings");

    within(rows[0]).getByTestId("lesson-delete").click();
    // The whole entry is passed back — the delete carries the authoritative
    // moduleId, never a number re-parsed from the filename.
    expect(onDelete).toHaveBeenCalledWith(lessons[0]);
  });

  it("shows an empty state when there are no lessons", () => {
    renderView(<LessonsView slug="s" lessons={[]} />);
    expect(screen.getByTestId("lessons-empty")).toBeInTheDocument();
  });
});
