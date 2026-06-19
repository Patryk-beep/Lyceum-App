import { beforeEach, describe, expect, it } from "vitest";

import {
  forgetSubject,
  lastSubject,
  recentSubjects,
  recordRoute,
  resumeRoute,
} from "../useResumeState";

beforeEach(() => localStorage.clear());

describe("resume state", () => {
  it("records subject routes and ignores global ones", () => {
    recordRoute("/subject/alpha/lessons", 100);
    recordRoute("/library", 200); // not a subject route — ignored
    expect(resumeRoute("alpha")).toBe("/subject/alpha/lessons");
    expect(recentSubjects().map((r) => r.slug)).toEqual(["alpha"]);
  });

  it("defaults an unseen subject to its hub", () => {
    expect(resumeRoute("zeta")).toBe("/subject/zeta");
  });

  it("keeps the latest route per subject and orders by recency", () => {
    recordRoute("/subject/alpha/lessons", 100);
    recordRoute("/subject/beta/capstone", 300);
    recordRoute("/subject/alpha/assignments", 400); // updates alpha's ts + route

    expect(resumeRoute("alpha")).toBe("/subject/alpha/assignments");
    expect(recentSubjects().map((r) => r.slug)).toEqual(["alpha", "beta"]);
    expect(lastSubject()).toBe("alpha");
  });

  it("forgets a deleted subject so it stops surfacing", () => {
    recordRoute("/subject/alpha/lessons", 100);
    recordRoute("/subject/beta/capstone", 200);
    forgetSubject("alpha");
    expect(recentSubjects().map((r) => r.slug)).toEqual(["beta"]);
    expect(resumeRoute("alpha")).toBe("/subject/alpha"); // back to hub default
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("lyceum-resume", "{not json");
    expect(recentSubjects()).toEqual([]);
    expect(lastSubject()).toBeNull();
  });
});
