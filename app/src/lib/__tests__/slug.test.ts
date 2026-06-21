import { describe, expect, it } from "vitest";

import { slugify } from "../slug";

// Parity with the Rust `service::slugify`: lowercase ASCII alnum, runs of any other
// char collapse to a single "-", trim leading/trailing "-".
describe("slugify (Rust parity)", () => {
  it.each([
    ["Conversational Spanish", "conversational-spanish"],
    ["  Linear Algebra!  ", "linear-algebra"],
    ["C++ basics", "c-basics"],
    ["déjà vu", "d-j-vu"],
    ["Intro to AI (2026)", "intro-to-ai-2026"],
    ["---weird---", "weird"],
    ["", ""],
    ["!!!", ""],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
