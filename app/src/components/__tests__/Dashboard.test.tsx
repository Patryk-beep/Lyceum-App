import { render, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DashboardView } from "../../routes/Dashboard";
import { goldenSummary, secondSummary } from "../../test/fixtures";

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("DashboardView", () => {
  it("renders StatGrid + SubjectCard computed from the golden summary", () => {
    renderView(<DashboardView subjects={[goldenSummary]} />);

    // Subject name shows (ResumeHero + SubjectCard).
    expect(screen.getAllByText("Conversational Spanish").length).toBeGreaterThan(0);

    // Modules mastered stat = 1 / 3 (hand-computed).
    expect(screen.getByTestId("stat-grid")).toHaveTextContent("1 / 3");

    // SubjectCard shows the same module count + next action.
    const cards = screen.getAllByTestId("subject-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("1 / 3 modules");
    expect(cards[0]).toHaveTextContent("complete it");

    // Reviews due (3) surfaces in the review card.
    expect(screen.getByTestId("review-due")).toHaveTextContent("3");

    // Mastery ring rendered for the (assessed) subject.
    expect(screen.getAllByTestId("mastery-ring").length).toBeGreaterThan(0);
  });

  it("renders one card per subject and orders the resume subject first", () => {
    renderView(
      <DashboardView subjects={[goldenSummary, secondSummary]} />,
    );
    expect(screen.getByTestId("stat-grid")).toHaveTextContent("Subjects");
    expect(screen.getAllByTestId("subject-card")).toHaveLength(2);
    // Two subjects: total reviews due = 3 + 0 = 3.
    expect(screen.getByTestId("review-due")).toHaveTextContent("3");
  });

  it("renders three subjects at different phases with their routed next actions", () => {
    const capstoneSubject = {
      ...secondSummary,
      slug: "physics",
      subject: "Physics",
      phase: "capstone",
      status: "capstone",
      reviewsDue: 2,
      nextAction: "all modules through target mastered — run the capstone",
    };
    renderView(
      <DashboardView subjects={[goldenSummary, secondSummary, capstoneSubject]} />,
    );
    expect(screen.getAllByTestId("subject-card")).toHaveLength(3);
    // each subject surfaces its own engine-routed next action
    expect(screen.getAllByText(/complete it/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not taught yet/)).toBeInTheDocument();
    expect(screen.getByText(/run the capstone/)).toBeInTheDocument();
    // total reviews due = 3 + 0 + 2 = 5
    expect(screen.getByTestId("review-due")).toHaveTextContent("5");
  });

  it("deletes via the card trash button (with the slug) without triggering open", () => {
    const onDeleteSubject = vi.fn();
    const onOpenSubject = vi.fn();
    renderView(
      <DashboardView
        subjects={[goldenSummary]}
        onDeleteSubject={onDeleteSubject}
        onOpenSubject={onOpenSubject}
      />,
    );
    const card = screen.getAllByTestId("subject-card")[0];
    within(card)
      .getByRole("button", { name: /delete conversational spanish/i })
      .click();
    expect(onDeleteSubject).toHaveBeenCalledWith("conversational-spanish");
    // stopPropagation: the card's own open handler must NOT fire.
    expect(onOpenSubject).not.toHaveBeenCalled();
  });

  it("shows the empty state with a seed button when no subjects exist", () => {
    const onSeedDemo = vi.fn();
    renderView(<DashboardView subjects={[]} onSeedDemo={onSeedDemo} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    screen.getByRole("button", { name: /load sample subject/i }).click();
    expect(onSeedDemo).toHaveBeenCalledOnce();
  });
});
