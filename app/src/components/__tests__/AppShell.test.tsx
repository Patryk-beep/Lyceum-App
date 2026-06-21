import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "../AppShell";
import { useZenStore } from "../../stores/useZenStore";

// AppShell pulls in live-session + resume + query hooks; stub them so the test renders
// just the chrome wiring we care about (inert + drawer suppression on zen).
vi.mock("../../lib/useSession", () => ({ useSessionSubscription: () => {} }));
vi.mock("../../hooks/useResumeState", () => ({
  useResumeRecorder: () => {},
  recentSubjects: () => [],
  resumeRoute: (s: string) => `/subject/${s}`,
}));
vi.mock("../../lib/query", () => ({
  useManifest: () => ({ data: null }),
  useStreak: () => ({ data: 0 }),
  useSubjects: () => ({ data: [] }),
}));

function renderShell() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/subject/spanish/assignments"]}>
        <AppShell>
          <div>child</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell zen wiring", () => {
  afterEach(() => {
    useZenStore.setState({ active: false, briefOpen: true, available: false });
  });

  it("inerts the shell and hides the live drawer while zen is active", () => {
    const { container } = renderShell();
    const shell = container.querySelector(".app-shell")!;

    // Default: drawer present, shell interactive.
    expect(screen.getByLabelText("Live session")).toBeInTheDocument();
    expect(shell.hasAttribute("inert")).toBe(false);

    act(() => useZenStore.setState({ active: true }));

    expect(shell.hasAttribute("inert")).toBe(true);
    expect(screen.queryByLabelText("Live session")).toBeNull();
  });
});
