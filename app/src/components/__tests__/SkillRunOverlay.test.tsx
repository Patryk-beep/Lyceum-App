import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useEngineStore } from "../../stores/useEngineStore";
import { SkillRunOverlay } from "../SkillRunOverlay";

describe("SkillRunOverlay", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("is absent when the subject is idle", () => {
    render(<SkillRunOverlay slug="demo" />);
    expect(screen.queryByTestId("skill-overlay")).toBeNull();
  });

  it("renders a modal dialog while THIS subject runs", () => {
    useEngineStore.getState().start("demo");
    render(<SkillRunOverlay slug="demo" />);
    const overlay = screen.getByTestId("skill-overlay");
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    // No manifest → generic working label, still descriptive enough to bar on.
    expect(screen.getByTestId("skill-run")).toHaveTextContent("Working…");
  });

  it("does not render for a different subject's run (per-subject gate)", () => {
    useEngineStore.getState().start("other");
    render(<SkillRunOverlay slug="demo" />);
    expect(screen.queryByTestId("skill-overlay")).toBeNull();
  });
});
