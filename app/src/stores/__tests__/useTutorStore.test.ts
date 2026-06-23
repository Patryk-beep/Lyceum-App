import { beforeEach, describe, expect, it } from "vitest";

import { useTutorStore } from "../useTutorStore";

const delta = (text: string) =>
  ({ kind: "textDelta", data: { turnId: 0, block: 0, text } }) as const;
const result = (text: string, ok = true) =>
  ({
    kind: "turnResult",
    data: { turnId: 0, ok, stopReason: null, text, costUsdListPrice: 0 },
  }) as const;

describe("useTutorStore", () => {
  beforeEach(() => useTutorStore.setState({ open: false, threads: {} }));

  it("ask records the question and marks the thread busy", () => {
    useTutorStore.getState().ask("s", "why?");
    const t = useTutorStore.getState().threads["s"];
    expect(t.messages).toEqual([{ role: "user", text: "why?" }]);
    expect(t.busy).toBe(true);
  });

  it("streams deltas then finalizes the assistant message on turnResult", () => {
    const { ask, apply } = useTutorStore.getState();
    ask("s", "q");
    apply("s", delta("Be"));
    apply("s", delta("cause"));
    expect(useTutorStore.getState().threads["s"].streaming).toBe("Because");
    apply("s", result("Because X."));
    const t = useTutorStore.getState().threads["s"];
    expect(t.busy).toBe(false);
    expect(t.streaming).toBe("");
    expect(t.messages[t.messages.length - 1]).toEqual({ role: "assistant", text: "Because X." });
  });

  it("finish is idempotent once a terminal stream event already finalized", () => {
    const { ask, apply, finish } = useTutorStore.getState();
    ask("s", "q");
    apply("s", result("A."));
    finish("s", "A."); // stream already finalized → must not double-append
    const assistants = useTutorStore
      .getState()
      .threads["s"].messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
  });

  it("finish finalizes when there was no live stream (browser preview)", () => {
    const { ask, finish } = useTutorStore.getState();
    ask("s", "q");
    finish("s", "Answer.");
    const t = useTutorStore.getState().threads["s"];
    expect(t.busy).toBe(false);
    expect(t.messages[t.messages.length - 1]).toEqual({ role: "assistant", text: "Answer." });
  });

  it("loadThread seeds an empty thread but never clobbers an active one", () => {
    const { ask, loadThread } = useTutorStore.getState();
    // seeds when empty
    loadThread("a", [{ role: "user", text: "old" }]);
    expect(useTutorStore.getState().threads["a"].messages).toHaveLength(1);
    // does not clobber an in-flight thread
    ask("b", "q");
    loadThread("b", [{ role: "user", text: "stale" }]);
    expect(useTutorStore.getState().threads["b"].messages).toEqual([
      { role: "user", text: "q" },
    ]);
  });
});
