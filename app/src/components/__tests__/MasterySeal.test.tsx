import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MasterySeal, type SealState } from "../MasterySeal";

describe("MasterySeal", () => {
  it("renders each of the four states with the RAW data-state on a single root", () => {
    const states: SealState[] = ["earned", "active", "available", "locked"];
    for (const s of states) {
      const { unmount } = render(<MasterySeal state={s} />);
      const seals = screen.getAllByTestId("mastery-seal");
      expect(seals).toHaveLength(1); // single root, no nested testid
      expect(seals[0].dataset.state).toBe(s); // raw SealState, not a visual name
      unmount();
    }
  });

  it("shows the gilt star only when earned and a lock glyph only when locked", () => {
    const { rerender } = render(<MasterySeal state="earned" />);
    expect(screen.getByTestId("mastery-seal")).toHaveTextContent("✦");

    rerender(<MasterySeal state="locked" />);
    const seal = screen.getByTestId("mastery-seal");
    expect(seal.querySelector("svg")).toBeInTheDocument();
    expect(seal).not.toHaveTextContent("✦");
  });
});
