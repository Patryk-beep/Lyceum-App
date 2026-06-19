import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppSidebarView } from "../AppSidebar";
import { goldenSummary, secondSummary } from "../../test/fixtures";
import type { LoopStage } from "../../theme/loop";

const stages: LoopStage[] = [
  { key: "research", label: "Research", seg: "research", status: "done" },
  { key: "lessons", label: "Lessons", seg: "lessons", status: "current" },
  { key: "capstone", label: "Capstone", seg: "capstone", status: "todo" },
];

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("AppSidebarView", () => {
  it("always shows the global zone; no loop spine off a subject", () => {
    renderView(
      <AppSidebarView
        pathname="/library"
        slug={null}
        activeKey={null}
        stages={[]}
        subjects={[]}
        subjectName={null}
        streakDays={0}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
    expect(screen.queryByTestId("loop-nav")).toBeNull();
    expect(screen.queryByTestId("subject-switcher")).toBeNull();
  });

  it("shows the loop spine + switcher inside a subject", () => {
    renderView(
      <AppSidebarView
        pathname="/subject/conversational-spanish/lessons"
        slug="conversational-spanish"
        activeKey="lessons"
        stages={stages}
        subjects={[goldenSummary, secondSummary]}
        subjectName="Conversational Spanish"
        streakDays={4}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByTestId("loop-nav")).toBeInTheDocument();
    expect(screen.getByTestId("subject-switcher")).toHaveTextContent(
      "Conversational Spanish",
    );
    expect(screen.getByTestId("loop-overview")).toHaveAttribute(
      "href",
      "/subject/conversational-spanish",
    );
  });

  it("switches subjects in one click via the popover", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderView(
      <AppSidebarView
        pathname="/subject/conversational-spanish"
        slug="conversational-spanish"
        activeKey={null}
        stages={stages}
        subjects={[goldenSummary, secondSummary]}
        subjectName="Conversational Spanish"
        streakDays={0}
        onNavigate={onNavigate}
      />,
    );
    await user.click(screen.getByTestId("subject-switcher"));
    await user.click(screen.getByRole("button", { name: secondSummary.subject }));
    expect(onNavigate).toHaveBeenCalledWith(secondSummary.slug);
  });
});
