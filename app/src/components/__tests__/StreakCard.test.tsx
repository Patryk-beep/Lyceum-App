import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StreakCard } from "../StreakCard";

describe("StreakCard", () => {
  it("shows the day count when the streak is active", () => {
    render(<StreakCard days={21} />);
    expect(screen.getByTestId("streak-card")).toHaveTextContent("21");
    expect(screen.getByTestId("streak-card")).toHaveTextContent(/unbroken/i);
  });

  it("renders nothing when the streak is zero", () => {
    const { container } = render(<StreakCard days={0} />);
    expect(container.firstChild).toBeNull();
  });
});
