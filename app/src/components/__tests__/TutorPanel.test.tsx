import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/ipc";
import { useTutorStore } from "../../stores/useTutorStore";
import { TutorPanel } from "../TutorPanel";

vi.mock("../../lib/ipc", () => ({
  api: {
    askTutor: vi.fn(() => Promise.resolve("Because ser is permanent.")),
    readTutorThread: vi.fn(() => Promise.resolve({ turns: [] })),
    clearTutorThread: vi.fn(() => Promise.resolve()),
  },
}));

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TutorPanel slug="spanish" scope={{ moduleId: "m02" }} />
    </QueryClientProvider>,
  );
}

describe("<TutorPanel>", () => {
  beforeEach(() => useTutorStore.setState({ open: false, threads: {} }));

  it("renders nothing when the panel is closed", () => {
    renderPanel();
    expect(screen.queryByTestId("tutor-panel")).not.toBeInTheDocument();
  });

  it("opens, sends a question with the current scope, and shows the answer", async () => {
    useTutorStore.setState({ open: true });
    renderPanel();
    expect(screen.getByTestId("tutor-panel")).toBeInTheDocument();

    const field = screen.getByLabelText("Ask the tutor");
    await userEvent.type(field, "why ser vs estar?");
    await userEvent.click(screen.getByRole("button", { name: /^ask$/i }));

    expect(api.askTutor).toHaveBeenCalledWith("spanish", "why ser vs estar?", {
      moduleId: "m02",
    });
    // The learner's question shows immediately…
    expect(await screen.findByText("why ser vs estar?")).toBeInTheDocument();
    // …and the resolved answer is appended (finish() fallback, no live stream in jsdom).
    expect(await screen.findByText(/ser is permanent/i)).toBeInTheDocument();
  });
});
