import { create } from "zustand";

import type { BridgeEvent } from "../lib/types";

export type EngineStatus = "idle" | "running" | "done" | "error";

export interface ToolStep {
  toolId: string;
  name: string;
  done: boolean;
}

export interface EngineInit {
  sessionId: string;
  apiKeySource: string | null;
  mcpServersEmpty: boolean;
  lyceumSkills: string[];
  pluginOk: boolean;
}

interface EngineState {
  status: EngineStatus;
  text: string;
  thinking: string;
  tools: ToolStep[];
  warnings: string[];
  init?: EngineInit;
  result?: { ok: boolean; text: string; stopReason: string | null };
  start: () => void;
  apply: (ev: BridgeEvent) => void;
  reset: () => void;
}

// Exported pure reducer so it can be unit-tested without the store.
export function reduce(state: EngineState, ev: BridgeEvent): Partial<EngineState> {
  switch (ev.kind) {
    case "sessionInit":
      return {
        init: {
          sessionId: ev.data.sessionId,
          apiKeySource: ev.data.apiKeySource,
          mcpServersEmpty: ev.data.mcpServersEmpty,
          lyceumSkills: ev.data.lyceumSkills,
          pluginOk: ev.data.pluginOk,
        },
      };
    case "turnStarted":
      return { status: "running" };
    case "textDelta":
      return { text: state.text + ev.data.text };
    case "thinkingDelta":
      return { thinking: state.thinking + ev.data.text };
    case "toolUseStart":
      return {
        tools: [
          ...state.tools,
          { toolId: ev.data.toolId, name: ev.data.name, done: false },
        ],
      };
    case "toolUseEnd":
      return {
        tools: state.tools.map((t) =>
          t.toolId === ev.data.toolId ? { ...t, done: true } : t,
        ),
      };
    case "turnResult":
      return {
        status: ev.data.ok ? "done" : "error",
        result: {
          ok: ev.data.ok,
          text: ev.data.text,
          stopReason: ev.data.stopReason,
        },
      };
    case "authWarning":
      return { warnings: [...state.warnings, `auth: billing via ${ev.data.source}`] };
    case "warning":
      return { warnings: [...state.warnings, ev.data.message] };
    case "fatal":
      return {
        status: "error",
        warnings: [...state.warnings, `fatal(${ev.data.kind}): ${ev.data.message}`],
      };
    default:
      return {};
  }
}

const EMPTY = {
  status: "idle" as EngineStatus,
  text: "",
  thinking: "",
  tools: [] as ToolStep[],
  warnings: [] as string[],
  init: undefined,
  result: undefined,
};

export const useEngineStore = create<EngineState>((set, get) => ({
  ...EMPTY,
  start: () => set({ ...EMPTY, status: "running" }),
  apply: (ev) => set(reduce(get(), ev)),
  reset: () => set(EMPTY),
}));
