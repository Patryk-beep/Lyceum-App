import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionDivider } from "../SectionDivider";
import { Sigil } from "../Sigil";

describe("Aurelia atoms", () => {
  it("Sigil renders an inline svg", () => {
    render(<Sigil size={80} />);
    const sigil = screen.getByTestId("sigil");
    expect(sigil.querySelector("svg")).toBeInTheDocument();
  });

  it("SectionDivider renders its label between two rules", () => {
    render(<SectionDivider label="Your subjects" />);
    expect(screen.getByTestId("section-divider")).toHaveTextContent("Your subjects");
  });
});
