import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Placement } from "../Placement";
import { api } from "../../lib/ipc";
import type { PlacementState } from "../../lib/types";
import { useEngineStore } from "../../stores/useEngineStore";

vi.mock("../../lib/ipc", () => ({
  api: {
    readArtifact: vi.fn(),
    runSubjectStep: vi.fn(),
    submitPlacementAnswer: vi.fn(),
    placementFinalize: vi.fn(),
  },
}));

function renderPlacement() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/subject/spanish/placement"]}>
        <Routes>
          <Route path="/subject/:slug/placement" element={<Placement />} />
          <Route path="/subject/:slug" element={<div data-testid="subject-hub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const QUESTION_STATE: PlacementState = {
  asked: 2,
  maxQuestions: 8,
  current: { id: "q2", tier: 4, question: "What is spaced repetition?" },
  lastFeedback: "Close — you named retrieval but missed the spacing interval.",
  history: [
    { id: "q1", question: "Define a flashcard.", answer: "a card", verdict: "correct", feedback: "Yes." },
  ],
  done: false,
  recommendedLevel: null,
  rationale: null,
};

const DONE_STATE: PlacementState = {
  asked: 4,
  maxQuestions: 8,
  current: null,
  lastFeedback: null,
  history: [
    { id: "q1", question: "…", answer: "…", verdict: "correct", feedback: "…" },
    { id: "q2", question: "…", answer: "…", verdict: "incorrect", feedback: "…" },
  ],
  done: true,
  recommendedLevel: 3,
  rationale: "Floor at L3, ceiling at L4.",
};

describe("Placement (interactive)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    useEngineStore.getState().reset(); // drop any per-subject run state between tests
    localStorage.clear(); // ZenEditor autosaves drafts per question — isolate tests
  });

  it("offers Begin when no state file exists yet, and runs a turn", async () => {
    vi.mocked(api.readArtifact).mockRejectedValue(new Error("404"));
    vi.mocked(api.runSubjectStep).mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderPlacement();
    const begin = await screen.findByTestId("placement-begin");
    expect(begin).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /begin placement/i }));
    expect(api.runSubjectStep).toHaveBeenCalledWith("spanish");
  });

  it("surfaces a failed turn and clears the engine run so the overlay can't strand the subject", async () => {
    vi.mocked(api.readArtifact).mockRejectedValue(new Error("404"));
    vi.mocked(api.runSubjectStep).mockRejectedValue(new Error("claude spawn failed"));
    const user = userEvent.setup();

    renderPlacement();
    await screen.findByTestId("placement-begin");
    await user.click(screen.getByRole("button", { name: /begin placement/i }));

    // The error is shown (not silently reset to an idle "Begin" button)…
    await screen.findByTestId("placement-error");
    // …and the engine run is cleared, so useIsBusy is false and the non-dismissible
    // overlay does not bar the subject.
    await waitFor(() =>
      expect(useEngineStore.getState().runs["spanish"]?.status ?? "idle").not.toBe("running"),
    );
  });

  it("renders the current question + graded feedback, and hands in the typed answer", async () => {
    vi.mocked(api.readArtifact).mockResolvedValue(JSON.stringify(QUESTION_STATE));
    vi.mocked(api.submitPlacementAnswer).mockResolvedValue(undefined as never);
    vi.mocked(api.runSubjectStep).mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderPlacement();
    await screen.findByTestId("placement-question");
    expect(screen.getByText("What is spaced repetition?")).toBeInTheDocument();
    // Feedback is collapsed by default — verdict chip shows; the detail expands on demand.
    const fb = screen.getByTestId("placement-feedback");
    expect(fb).toHaveTextContent(/correct/i); // verdict from history q1
    expect(fb).not.toHaveTextContent(/missed the spacing interval/i);
    await user.click(within(fb).getByRole("button"));
    expect(fb).toHaveTextContent(/missed the spacing interval/i);

    await user.type(screen.getByTestId("submission-textarea"), "review at growing intervals");
    await user.click(screen.getByTestId("submission-submit"));
    await waitFor(() =>
      expect(api.submitPlacementAnswer).toHaveBeenCalledWith(
        "spanish",
        "q2",
        "review at growing intervals",
      ),
    );
    // The hand-in chains straight into the grade-and-ask turn.
    await waitFor(() => expect(api.runSubjectStep).toHaveBeenCalledWith("spanish"));
  });

  it("shows an in-context Checking card while grading, echoing the submitted answer", async () => {
    vi.mocked(api.readArtifact).mockResolvedValue(JSON.stringify(QUESTION_STATE));
    // Hold the submit pending so the grading (busy) state stays on screen.
    vi.mocked(api.submitPlacementAnswer).mockReturnValue(
      new Promise(() => {}) as never,
    );
    const user = userEvent.setup();

    renderPlacement();
    await screen.findByTestId("placement-question");
    await user.type(screen.getByTestId("submission-textarea"), "review at intervals");
    await user.click(screen.getByTestId("submission-submit"));

    const checking = await screen.findByTestId("placement-checking");
    expect(checking).toHaveTextContent("Checking your answer…");
    expect(checking).toHaveTextContent("review at intervals");
    // The live question form is gone while checking (no double editor).
    expect(screen.queryByTestId("placement-question")).toBeNull();
  });

  it("shows the recommendation and commits the level on accept", async () => {
    vi.mocked(api.readArtifact).mockResolvedValue(JSON.stringify(DONE_STATE));
    vi.mocked(api.placementFinalize).mockResolvedValue({} as never);
    const user = userEvent.setup();

    renderPlacement();
    await screen.findByTestId("placement-result");
    expect(screen.getByText("Level 3")).toBeInTheDocument(); // the <strong> recommendation
    expect(screen.getByText(/Floor at L3, ceiling at L4\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start at level 3/i }));
    await waitFor(() => expect(api.placementFinalize).toHaveBeenCalledTimes(1));
    const [slug, level, evidence] = vi.mocked(api.placementFinalize).mock.calls[0];
    expect(slug).toBe("spanish");
    expect(level).toBe(3);
    expect(evidence).toContain("Floor at L3");
  });
});
