import { beforeEach, describe, expect, it } from "vitest";

import type { BridgeEvent } from "../../lib/types";
import { useEngineStore } from "../useEngineStore";

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
    data: {
      turnId: 0,
      ok: true,
      stopReason: "end_turn",
      text: "Hello",
      costUsdListPrice: 0.01,
    },
  },
];

describe("engine store", () => {
  beforeEach(() => useEngineStore.getState().reset());

  it("folds a full turn into final state", () => {
    useEngineStore.getState().start();
    for (const ev of turn) useEngineStore.getState().apply(ev);
    const st = useEngineStore.getState();
    expect(st.text).toBe("Hello");
    expect(st.status).toBe("done");
    expect(st.init?.mcpServersEmpty).toBe(true);
    expect(st.init?.lyceumSkills).toContain("lyceum:learn");
    expect(st.tools).toHaveLength(1);
    expect(st.tools[0].done).toBe(true);
    expect(st.result?.ok).toBe(true);
  });

  it("marks error status on a failed result and records auth warnings", () => {
    useEngineStore
      .getState()
      .apply({ kind: "authWarning", data: { source: "ANTHROPIC_API_KEY" } });
    useEngineStore.getState().apply({
      kind: "turnResult",
      data: { turnId: 0, ok: false, stopReason: "watchdog", text: "", costUsdListPrice: 0 },
    });
    const st = useEngineStore.getState();
    expect(st.status).toBe("error");
    expect(st.warnings.some((w) => w.includes("ANTHROPIC_API_KEY"))).toBe(true);
  });
});
