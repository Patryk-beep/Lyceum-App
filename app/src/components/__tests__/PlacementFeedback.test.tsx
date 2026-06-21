import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlacementFeedback } from "../PlacementFeedback";

describe("PlacementFeedback", () => {
  it("shows the verdict chip but hides the detail until expanded", async () => {
    const user = userEvent.setup();
    render(<PlacementFeedback verdict="partial" feedback="You **missed** the variance." />);
    // Collapsed: verdict + label visible, detail not rendered.
    expect(screen.getByText("~ Partial")).toBeInTheDocument();
    expect(screen.queryByText(/missed/)).toBeNull();
    // Expand → markdown-rendered detail appears.
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/missed/)).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("renders without a chip when the verdict is unknown", () => {
    render(<PlacementFeedback feedback="ok" />);
    expect(screen.getByTestId("placement-feedback")).toBeInTheDocument();
    expect(screen.queryByText(/Correct|Partial|Incorrect/)).toBeNull();
  });
});
