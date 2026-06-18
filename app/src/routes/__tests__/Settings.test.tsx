import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Settings } from "../Settings";
import { checkForUpdate } from "../../lib/updates";

vi.mock("../../lib/updates", () => ({ checkForUpdate: vi.fn() }));

describe("Settings — updates", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders the check-for-updates control", () => {
    render(<Settings />);
    expect(screen.getByTestId("check-updates")).toBeInTheDocument();
  });

  it("reports up-to-date after a check finds nothing", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({ available: false });
    render(<Settings />);
    fireEvent.click(screen.getByTestId("check-updates"));
    await waitFor(() =>
      expect(screen.getByText(/latest version/i)).toBeInTheDocument(),
    );
  });

  it("offers Install & restart when an update is available", async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      available: true,
      version: "9.9.9",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { downloadAndInstall: vi.fn() } as any,
    });
    render(<Settings />);
    fireEvent.click(screen.getByTestId("check-updates"));
    await waitFor(() => expect(screen.getByTestId("install-update")).toBeInTheDocument());
    expect(screen.getByText(/9\.9\.9/)).toBeInTheDocument();
  });
});
