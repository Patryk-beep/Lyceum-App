import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewCard } from "../ReviewCard";
import { ReviewView } from "../../routes/Review";
import type { ReviewCandidate } from "../../lib/types";

const card: ReviewCandidate = {
  itemId: "r002",
  prompt: "Conjugate 'hablar' (yo)",
  answer: "hablo",
  moduleId: "m02",
  boxNum: 1,
  preview: { again: 1, hard: 3, good: 3, easy: 3 },
};

describe("ReviewCard", () => {
  it("withholds the answer until reveal, then shows SRS buttons with Rust intervals", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();
    render(<ReviewCard card={card} onGrade={onGrade} />);

    // Answer hidden initially (retrieval-first).
    expect(screen.queryByTestId("answer")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("reveal"));
    expect(screen.getByTestId("answer")).toHaveTextContent("hablo");

    // Interval labels come from the preview (good -> 3d).
    const good = screen.getByRole("button", { name: /good/i });
    expect(good).toHaveTextContent("3d");
    await user.click(good);
    expect(onGrade).toHaveBeenCalledWith("good");
  });
});

describe("ReviewView", () => {
  it("renders the empty state when nothing is due", () => {
    render(<ReviewView slug="x" cards={[]} onGrade={() => {}} />);
    expect(screen.getByTestId("review-empty")).toBeInTheDocument();
  });

  it("advances through the queue on grade", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();
    render(<ReviewView slug="x" cards={[card]} onGrade={onGrade} />);
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();
    await user.click(screen.getByTestId("reveal"));
    await user.click(screen.getByRole("button", { name: /good/i }));
    expect(onGrade).toHaveBeenCalledWith("x", "r002", "good");
    expect(screen.getByTestId("review-done")).toBeInTheDocument();
  });
});
