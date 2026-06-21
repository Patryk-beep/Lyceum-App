import { beforeEach, describe, expect, it } from "vitest";

import type { BridgeEvent } from "../../lib/types";
import { EMPTY_RUN, useEngineStore } from "../useEngineStore";

const turn: BridgeEvent[] = [
  {
    kind: "sessionInit",
    data: {
      sessionId: "s1",
      model: "claude-opus-4-8",
      apiKeySource: "none",
      mcpServersEmpty: true,
      lyceumSkills: ["lyceum:learn"],
      pluginOk: true,
    },
  },
  { kind: "turnStarted", data: { turnId: 0 } },
  { kind: "textDelta", data: { turnId: 0, block: 0, text: "Hel" } },
  { kind: "textDelta", data: { turnId: 0, block: 0, text: "lo" } },
  { kind: "toolUseStart", data: { turnId: 0, block: 1, toolId: "t1", name: "Read" } },
  { kind: "toolUseEnd", data: { turnId: 0, block: 1, toolId: "t1", name: "Read" } },
  {
    kind: "turnResult",
    data: { turnId: 0, ok: true, stopReason: "end_turn", text: "Hello", costUsdListPrice: 0.01 },
  },
];

const run = (slug: string) => useEngineStore.getState().runs[slug] ?? EMPTY_RUN;

describe("engine store (per-subject)", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("folds a full turn into one subject's run, isolated from others", () => {
    useEngineStore.getState().start("spanish");
    for (const ev of turn) useEngineStore.getState().apply("spanish", ev);

    const st = run("spanish");
    expect(st.text).toBe("Hello");
    expect(st.status).toBe("done");
    expect(st.init?.lyceumSkills).toContain("lyceum:learn");
    expect(st.tools).toHaveLength(1);
    expect(st.tools[0].done).toBe(true);
    expect(st.result?.ok).toBe(true);
    expect(st.startedAt).toBeTypeOf("number");
    // A different subject is untouched.
    expect(run("french").status).toBe("idle");
  });

  it("tracks two subjects concurrently and independently", () => {
    const s = useEngineStore.getState();
    s.start("a");
    s.start("b");
    s.apply("a", { kind: "textDelta", data: { turnId: 0, block: 0, text: "AAA" } });
    s.apply("b", { kind: "turnResult", data: { turnId: 0, ok: true, stopReason: "end_turn", text: "", costUsdListPrice: 0 } });
    expect(run("a").status).toBe("running");
    expect(run("a").text).toBe("AAA");
    expect(run("b").status).toBe("done");
  });

  it("accumulates creation milestones, dedupes, and resets per subject", () => {
    const s = useEngineStore.getState();
    s.apply("x", { kind: "milestone", data: { phase: "research" } });
    s.apply("x", { kind: "milestone", data: { phase: "research" } }); // dup ignored
    s.apply("x", { kind: "milestone", data: { phase: "curriculum" } });
    expect(run("x").milestones).toEqual(["research", "curriculum"]);
    useEngineStore.getState().reset("x");
    expect(run("x").status).toBe("idle");
    expect(run("x").milestones).toEqual([]);
  });

  it("marks error status on a failed result and records auth warnings", () => {
    const s = useEngineStore.getState();
    s.apply("z", { kind: "authWarning", data: { source: "ANTHROPIC_API_KEY" } });
    s.apply("z", {
      kind: "turnResult",
      data: { turnId: 0, ok: false, stopReason: "watchdog", text: "", costUsdListPrice: 0 },
    });
    expect(run("z").status).toBe("error");
    expect(run("z").warnings.some((w) => w.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });
});
