import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MasteryRing } from "../MasteryRing";

describe("MasteryRing", () => {
  it("renders a rounded percentage for an assessed value", () => {
    render(<MasteryRing value={0.91} />);
    expect(screen.getByTestId("mastery-ring")).toHaveTextContent("91%");
  });

  it("renders an em dash when unassessed", () => {
    render(<MasteryRing value={null} />);
    expect(screen.getByTestId("mastery-ring")).toHaveTextContent("—");
  });

  it("renders the opt-in gilt dial with a caption, keeping the same testid + value", () => {
    render(<MasteryRing value={0.62} dial label="gilt" />);
    const ring = screen.getByTestId("mastery-ring");
    expect(ring).toHaveTextContent("62%");
    expect(ring).toHaveTextContent("gilt");
  });
});
