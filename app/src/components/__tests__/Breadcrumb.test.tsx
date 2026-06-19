import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Breadcrumb } from "../Breadcrumb";

function renderView(ui: React.ReactNode) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("Breadcrumb", () => {
  it("renders nothing on the subject hub (depth < 3)", () => {
    renderView(<Breadcrumb pathname="/subject/spanish" subjectName="Spanish" />);
    expect(screen.queryByTestId("breadcrumb")).toBeNull();
  });

  it("renders nothing on global pages", () => {
    renderView(<Breadcrumb pathname="/review" subjectName={null} />);
    expect(screen.queryByTestId("breadcrumb")).toBeNull();
  });

  it("shows a linked trail at depth >= 3", () => {
    renderView(
      <Breadcrumb pathname="/subject/spanish/lessons" subjectName="Spanish" />,
    );
    const nav = screen.getByTestId("breadcrumb");
    expect(nav).toHaveTextContent("Library");
    expect(nav).toHaveTextContent("Spanish");
    expect(nav).toHaveTextContent("Lessons");
    // The subject crumb links back to the hub.
    expect(screen.getByRole("link", { name: "Spanish" })).toHaveAttribute(
      "href",
      "/subject/spanish",
    );
  });
});
