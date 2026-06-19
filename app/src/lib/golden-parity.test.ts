import { describe, expect, it } from "vitest";

import golden from "../../tests/fixtures/manifests/golden.json";
import type { Manifest } from "./types";

// Cheap schema-parity guard: the Rust-serialized fixture must carry the exact
// camelCase keys the hand-authored TS `Manifest` type expects. ts-rs replaces
// this with generated types in M2; until then this catches drift.
describe("golden.json fixture parity", () => {
  const m = golden as unknown as Manifest;

  it("uses the camelCase keys the TS types expect", () => {
    expect(m.subject).toBe("Conversational Spanish");
    expect(Array.isArray(m.reviewQueue)).toBe(true);
    expect(m.modules[0]).toHaveProperty("masteryThreshold");
    expect(m.modules[0].objectives[0]).toHaveProperty("lastAssessed");
    expect(m.current).toHaveProperty("moduleId");
  });

  it("encodes the constrained enums on the wire as expected", () => {
    expect(typeof m.scale.start === "number").toBe(true);
    expect(typeof m.reviewQueue[0].box === "number").toBe(true);
    expect(["pass", "fail", undefined]).toContain(m.reviewQueue[0].lastResult);
  });

  it("carries the assignments array with the `type` wire key (not `kind`)", () => {
    expect(Array.isArray(m.assignments)).toBe(true);
    const a = m.assignments[0];
    expect(a).toMatchObject({ id: "a02", moduleId: "m02", status: "open" });
    expect(a.type).toBe("guided-practice"); // serde renames kind -> type
    expect(a).not.toHaveProperty("kind");
    expect(a).toHaveProperty("file");
    expect(Array.isArray(a.objectives)).toBe(true);
  });
});
