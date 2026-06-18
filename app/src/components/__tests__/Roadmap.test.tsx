import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RoadmapView } from "../../routes/Roadmap";
import golden from "../../../tests/fixtures/manifests/golden.json";
import type { Manifest } from "../../lib/types";

const manifest = golden as unknown as Manifest;

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("RoadmapView", () => {
  it("renders one node per module with the correct seal states", () => {
    renderView(<RoadmapView manifest={manifest} />);
    const nodes = screen.getAllByTestId("roadmap-node");
    expect(nodes).toHaveLength(3);

    // m01 mastered -> earned; m02 is current (in-progress) -> active; m03 locked.
    const states = screen.getAllByTestId("mastery-seal").map((el) => el.dataset.state);
    expect(states).toContain("earned");
    expect(states).toContain("active");
    expect(states).toContain("locked");
  });

  it("shows the run-next-step affordance", () => {
    renderView(<RoadmapView manifest={manifest} />);
    expect(
      screen.getByRole("button", { name: /run next step/i }),
    ).toBeInTheDocument();
  });
});
