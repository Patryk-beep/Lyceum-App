import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { Manifest } from "../../lib/types";
import { useEngineStore } from "../../stores/useEngineStore";
import { SkillRunProgress, skillLabel } from "../SkillRunProgress";

const m = (o: Partial<Manifest>) => o as unknown as Manifest;

describe("skillLabel", () => {
  it("maps manifest state to a descriptive label", () => {
    expect(skillLabel(undefined)).toBe("Working…");
    expect(skillLabel(m({ modules: [], current: { status: "x" } }))).toBe(
      "Researching the subject",
    );
    expect(
      skillLabel(m({ modules: [{}] as never, current: { phase: "teach", status: "x" } })),
    ).toBe("Teaching the next lesson");
    expect(
      skillLabel(m({ modules: [{}] as never, current: { phase: "assess", status: "x" } })),
    ).toBe("Assessing your work");
    expect(
      skillLabel(m({ modules: [{}] as never, current: { phase: "capstone", status: "x" } })),
    ).toBe("Running the capstone");
  });
});

describe("<SkillRunProgress>", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("shows the label, an elapsed timer, and the live console", () => {
    useEngineStore.getState().start("demo");
    render(<SkillRunProgress slug="demo" label="Teaching the next lesson" />);
    expect(screen.getByTestId("skill-run")).toHaveTextContent("Teaching the next lesson");
    expect(screen.getByLabelText("elapsed time")).toBeInTheDocument();
    expect(screen.getByTestId("session-console")).toBeInTheDocument();
  });
});
