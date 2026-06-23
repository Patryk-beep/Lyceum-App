import { describe, expect, it } from "vitest";

import { currentWeakObjectives, gateFailingObjectives } from "../remediation";
import type { Manifest, Module } from "../types";

const mod = (over: Partial<Module>): Module => ({
  id: "m01",
  title: "t",
  level: 1,
  prereqs: [],
  status: "in-progress",
  taught: true,
  masteryThreshold: 0.9,
  objectives: [],
  ...over,
});

describe("gateFailingObjectives", () => {
  it("picks unscored and below-threshold objectives (mirrors the Rust gate)", () => {
    const m = mod({
      objectives: [
        { id: "o1", text: "a", mastery: 0.95 }, // clears
        { id: "o2", text: "b", mastery: 0.4 }, // below
        { id: "o3", text: "c" }, // unscored
      ],
    });
    expect(gateFailingObjectives(m).map((o) => o.id)).toEqual(["o2", "o3"]);
  });

  it("returns [] for an empty-objective module", () => {
    expect(gateFailingObjectives(mod({ objectives: [] }))).toEqual([]);
  });
});

describe("currentWeakObjectives", () => {
  it("reads the current module's failing objectives", () => {
    const manifest = {
      current: { moduleId: "m02", status: "in-progress" },
      modules: [
        mod({ id: "m01", objectives: [{ id: "o1", text: "x", mastery: 0.95 }] }),
        mod({ id: "m02", objectives: [{ id: "m02-o1", text: "y", mastery: 0.5 }] }),
      ],
    } as unknown as Manifest;
    expect(currentWeakObjectives(manifest).map((o) => o.id)).toEqual(["m02-o1"]);
  });

  it("returns [] when there is no current module", () => {
    const manifest = { current: { status: "x" }, modules: [] } as unknown as Manifest;
    expect(currentWeakObjectives(manifest)).toEqual([]);
  });
});
