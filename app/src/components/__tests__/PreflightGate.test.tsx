import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreflightGate } from "../PreflightGate";
import { engineApi } from "../../lib/engine";

vi.mock("../../lib/engine", () => ({
  engineApi: { preflight: vi.fn() },
}));

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PreflightGate>
        <div data-testid="app-content">app</div>
      </PreflightGate>
    </QueryClientProvider>,
  );
}

describe("PreflightGate", () => {
  afterEach(() => vi.clearAllMocks());

  it("blocks with a setup screen when the bridge is not ready", async () => {
    vi.mocked(engineApi.preflight).mockResolvedValue({
      claudeFound: false,
      pluginStaged: true,
      ready: false,
      error: "claude binary not found",
      claudePath: null,
    });
    renderGate();
    await waitFor(() => expect(screen.getByTestId("setup-screen")).toBeInTheDocument());
    expect(screen.getByText(/claude binary not found/)).toBeInTheDocument();
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
  });

  it("renders the app when the bridge is ready", async () => {
    vi.mocked(engineApi.preflight).mockResolvedValue({
      claudeFound: true,
      pluginStaged: true,
      ready: true,
      error: null,
      claudePath: "/usr/local/bin/claude",
    });
    renderGate();
    await waitFor(() => expect(screen.getByTestId("app-content")).toBeInTheDocument());
  });
});
