import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../CommandPalette";

function renderPalette(onOpenChange = () => {}, route = "/subject/spanish/lessons") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <CommandPalette open onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CommandPalette", () => {
  it("opens to navigate mode with stage + global targets", () => {
    renderPalette();
    expect(screen.getByTestId("palette-input")).toBeInTheDocument();
    // Subject-scoped stages (from the route) and global pages both reachable.
    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
  });

  it("switches to actions on the > prefix and hides nav targets", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByTestId("palette-input"), ">");
    expect(screen.getByText("Run next step")).toBeInTheDocument();
    expect(screen.getByText("Switch theme: Night")).toBeInTheDocument();
    expect(screen.queryByText("Library")).toBeNull();
  });

  it("closes after selecting a target", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderPalette(onOpenChange);
    await user.click(screen.getByText("Library"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("filters by typed query", async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByTestId("palette-input"), "capst");
    expect(screen.getByText("Capstone")).toBeInTheDocument();
    expect(screen.queryByText("Library")).toBeNull();
  });
});
