import { describe, expect, it } from "vitest";

import { parsePlacementState } from "../placement";

describe("parsePlacementState", () => {
  it("reads current.prompt as the question (the real on-disk drift that blanked the UI)", () => {
    // Verbatim shape observed in a live placement-state.json: `prompt`, nested
    // `lastFeedback`, extra `concept`/`L`/`step` fields.
    const s = parsePlacementState(
      JSON.stringify({
        subject: "Math",
        slug: "math",
        asked: 1,
        maxQuestions: 8,
        L: 3.5,
        step: 1.0,
        done: false,
        history: [],
        current: {
          id: "q1",
          tier: 3,
          concept: "c11 — Loans and annuities",
          prompt: "A loan of 10,000 is repaid by level payments…",
          lastFeedback: null,
        },
      }),
    );
    expect(s?.current?.question).toBe("A loan of 10,000 is repaid by level payments…");
    expect(s?.current?.tier).toBe(3);
    expect(s?.asked).toBe(1);
  });

  it("accepts the documented `question` field and top-level lastFeedback", () => {
    const s = parsePlacementState(
      JSON.stringify({
        asked: 2,
        maxQuestions: 8,
        done: false,
        current: { id: "q2", tier: 4, question: "Define spaced repetition" },
        lastFeedback: "Close.",
        history: [{ id: "q1", verdict: "correct" }],
      }),
    );
    expect(s?.current?.question).toBe("Define spaced repetition");
    expect(s?.lastFeedback).toBe("Close.");
  });

  it("falls back to lastFeedback nested in current", () => {
    const s = parsePlacementState(
      JSON.stringify({
        asked: 2,
        maxQuestions: 8,
        done: false,
        current: { id: "q2", tier: 4, prompt: "Q", lastFeedback: "Nested feedback" },
        history: [],
      }),
    );
    expect(s?.lastFeedback).toBe("Nested feedback");
  });

  it("returns null on unparseable or non-object input", () => {
    expect(parsePlacementState("not json")).toBeNull();
    expect(parsePlacementState("null")).toBeNull();
    expect(parsePlacementState("42")).toBeNull();
  });
});
