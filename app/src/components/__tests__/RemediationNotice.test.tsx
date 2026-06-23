import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Objective } from "../../lib/types";
import { RemediationNotice } from "../RemediationNotice";

describe("<RemediationNotice>", () => {
  it("lists the weak objectives with an encouraging frame", () => {
    const objs = [
      { id: "o1", text: "Conjugate -ar verbs" },
      { id: "o2", text: "Use ser vs estar" },
    ] as Objective[];
    render(<RemediationNotice objectives={objs} />);
    expect(screen.getByTestId("remediation-notice")).toHaveTextContent(
      /revisit the tricky parts/i,
    );
    expect(screen.getByText("Conjugate -ar verbs")).toBeInTheDocument();
    expect(screen.getByText("Use ser vs estar")).toBeInTheDocument();
  });

  it("renders without a list when there are no objectives", () => {
    render(<RemediationNotice objectives={[]} />);
    expect(screen.getByTestId("remediation-notice")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
