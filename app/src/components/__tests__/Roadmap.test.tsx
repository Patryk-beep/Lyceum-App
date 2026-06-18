import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoadmapView } from "../../routes/Roadmap";
import golden from "../../../tests/fixtures/manifests/golden.json";
import type { Manifest } from "../../lib/types";

const manifest = golden as unknown as Manifest;

describe("RoadmapView", () => {
  it("renders one node per module with the correct seal states", () => {
    render(<RoadmapView manifest={manifest} />);
    const nodes = screen.getAllByTestId("roadmap-node");
    expect(nodes).toHaveLength(3);

    // m01 mastered -> earned; m02 is current (in-progress) -> active; m03 locked.
    const states = screen.getAllByTestId("mastery-seal").map((el) => el.dataset.state);
    expect(states).toContain("earned");
    expect(states).toContain("active");
    expect(states).toContain("locked");
  });

  it("shows the run-next-step affordance", () => {
    render(<RoadmapView manifest={manifest} />);
    expect(
      screen.getByRole("button", { name: /run next step/i }),
    ).toBeInTheDocument();
  });
});
