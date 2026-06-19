import { describe, expect, it } from "vitest";

import golden from "../../../tests/fixtures/manifests/golden.json";
import type { Manifest } from "../../lib/types";
import {
  crumbsFor,
  currentLoopKey,
  loopStages,
  pageLabel,
  parseSubjectRoute,
  segToLoopKey,
} from "../loop";

const m = golden as unknown as Manifest;

describe("loop model", () => {
  it("derives the current stage from the manifest phase", () => {
    // golden: placement taken, modules exist, phase 'assign', not certified.
    expect(currentLoopKey(m)).toBe("assignments");
  });

  it("builds the six-stage spine with honest done/current/todo states", () => {
    const stages = loopStages(m, { reviewsDue: 3 });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey).toEqual({
      research: "done", // modules exist
      placement: "done", // start is numeric (not "test")
      lessons: "done", // m01/m02 taught
      assignments: "current", // === currentLoopKey
      review: "todo", // ongoing, never "done"
      capstone: "todo", // not certified
    });
    const review = stages.find((s) => s.key === "review");
    expect(review?.badge).toBe(3);
  });

  it("omits the review badge when there are no due reviews", () => {
    const stages = loopStages(m, {});
    expect(stages.find((s) => s.key === "review")?.badge).toBeUndefined();
  });

  it("treats a deferred placement as the current stage", () => {
    const test = {
      ...m,
      scale: { start: "test", target: 4 },
      placement: { taken: false },
    } as unknown as Manifest;
    expect(currentLoopKey(test)).toBe("placement");
    expect(loopStages(test).find((s) => s.key === "placement")?.status).toBe(
      "current",
    );
  });

  it("shows ✓ (done), not ●, on a certified subject's capstone", () => {
    const done = {
      ...m,
      certification: { certified: true },
    } as unknown as Manifest;
    expect(currentLoopKey(done)).toBe("capstone");
    const stages = loopStages(done);
    expect(stages.find((s) => s.key === "capstone")?.status).toBe("done");
    // a finished subject has no "current" stage
    expect(stages.some((s) => s.status === "current")).toBe(false);
  });
});

describe("route parsing", () => {
  it("extracts slug + active spine key, folding detail routes into their list", () => {
    expect(parseSubjectRoute("/subject/spanish/lessons")).toMatchObject({
      slug: "spanish",
      activeKey: "lessons",
    });
    expect(parseSubjectRoute("/subject/spanish/lesson/01-x.md").activeKey).toBe(
      "lessons",
    );
    expect(parseSubjectRoute("/subject/spanish/assignment/a02").activeKey).toBe(
      "assignments",
    );
    expect(parseSubjectRoute("/subject/spanish").activeKey).toBeNull();
    expect(parseSubjectRoute("/library").slug).toBeNull();
  });

  it("maps non-spine segments to null", () => {
    expect(segToLoopKey("analytics")).toBeNull();
    expect(segToLoopKey("artifact")).toBeNull();
    expect(segToLoopKey("capstone")).toBe("capstone");
  });
});

describe("breadcrumbs", () => {
  it("renders nothing for global pages and the subject hub (depth < 3)", () => {
    expect(crumbsFor("/library", null)).toEqual([]);
    expect(crumbsFor("/subject/spanish", "Spanish")).toEqual([]);
  });

  it("builds Library > Subject > Stage at depth 3 (stage is current)", () => {
    const c = crumbsFor("/subject/spanish/lessons", "Spanish");
    expect(c.map((x) => x.label)).toEqual(["Library", "Spanish", "Lessons"]);
    expect(c[c.length - 1].to).toBeUndefined();
    expect(c[1].to).toBe("/subject/spanish");
  });

  it("keeps the stage linked when a leaf is the current crumb", () => {
    const c = crumbsFor("/subject/spanish/lesson/01-greetings.md", "Spanish");
    expect(c.map((x) => x.label)).toEqual([
      "Library",
      "Spanish",
      "Lessons",
      "01-greetings.md",
    ]);
    expect(c[2].to).toBe("/subject/spanish/lessons"); // stage stays a link
    expect(c[3].to).toBeUndefined(); // leaf is current
  });

  it("does not link the artifact crumb (no list route → would 404)", () => {
    const c = crumbsFor("/subject/spanish/artifact/lessons/x.md", "Spanish");
    const artifactCrumb = c.find((x) => x.label === "Artifact");
    expect(artifactCrumb).toBeDefined();
    expect(artifactCrumb?.to).toBeUndefined(); // plain label, not a link
  });

  it("labels the current page for the live announcer", () => {
    expect(pageLabel("/subject/spanish/lessons", "Spanish")).toBe("Lessons");
    expect(pageLabel("/subject/spanish", "Spanish")).toBe("Spanish");
    expect(pageLabel("/review")).toBe("Review");
  });
});
