import type { SubjectSummary } from "../lib/types";

// Mirrors the Rust-computed summary for golden.json (asserted in
// lyceum-core summary tests). Used by presentational component tests.
export const goldenSummary: SubjectSummary = {
  slug: "conversational-spanish",
  subject: "Conversational Spanish",
  level: 2,
  target: 4,
  status: "in-progress",
  phase: "assign",
  modulesTotal: 3,
  modulesMastered: 1,
  meanMastery: 0.765,
  reviewsDue: 3,
  nextAction: "current module has an open assignment — complete it",
  updated: "2026-06-18",
};

export const secondSummary: SubjectSummary = {
  slug: "intro-calculus",
  subject: "Intro Calculus",
  level: 1,
  target: 3,
  status: "in-progress",
  phase: "teach",
  modulesTotal: 5,
  modulesMastered: 0,
  meanMastery: null,
  reviewsDue: 0,
  nextAction: "current module not taught yet — deliver the lesson",
  updated: "2026-06-15",
};
