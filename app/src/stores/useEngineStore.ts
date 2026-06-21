import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { BridgeEvent } from "../lib/types";

export type EngineStatus = "idle" | "running" | "done" | "error";

/** Reserved slug for the Diagnostics smoke turn (no real subject). Mirrors the
 *  Rust `DIAGNOSTICS_SLUG` so its events land in their own run. */
export const DIAGNOSTICS_SLUG = "__diagnostics__";

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

/** Live state of ONE subject's skill turn. */
export interface RunState {
  status: EngineStatus;
  text: string;
  thinking: string;
  tools: ToolStep[];
  warnings: string[];
  /** Subject-creation phases seen so far (research/placement/curriculum). */
  milestones: string[];
  /** Epoch ms when this run started (for the elapsed timer). */
  startedAt?: number;
  init?: EngineInit;
  result?: { ok: boolean; text: string; stopReason: string | null };
}

export const EMPTY_RUN: RunState = {
  status: "idle",
  text: "",
  thinking: "",
  tools: [],
  warnings: [],
  milestones: [],
};

interface EngineState {
  /** Per-subject run state, keyed by slug. */
  runs: Record<string, RunState>;
  start: (slug: string) => void;
  apply: (slug: string, ev: BridgeEvent) => void;
  /** Clear one subject's run, or all when called with no slug. */
  reset: (slug?: string) => void;
}

// Exported pure reducer for a single run, so it can be unit-tested without the store.
export function reduceRun(run: RunState, ev: BridgeEvent): RunState {
  switch (ev.kind) {
    case "sessionInit":
      return {
        ...run,
        init: {
          sessionId: ev.data.sessionId,
          apiKeySource: ev.data.apiKeySource,
          mcpServersEmpty: ev.data.mcpServersEmpty,
          lyceumSkills: ev.data.lyceumSkills,
          pluginOk: ev.data.pluginOk,
        },
      };
    case "turnStarted":
      return { ...run, status: "running" };
    case "textDelta":
      return { ...run, text: run.text + ev.data.text };
    case "thinkingDelta":
      return { ...run, thinking: run.thinking + ev.data.text };
    case "toolUseStart":
      return {
        ...run,
        tools: [...run.tools, { toolId: ev.data.toolId, name: ev.data.name, done: false }],
      };
    case "toolUseEnd":
      return {
        ...run,
        tools: run.tools.map((t) =>
          t.toolId === ev.data.toolId ? { ...t, done: true } : t,
        ),
      };
    case "turnResult":
      return {
        ...run,
        status: ev.data.ok ? "done" : "error",
        result: {
          ok: ev.data.ok,
          text: ev.data.text,
          stopReason: ev.data.stopReason,
        },
      };
    case "milestone":
      return run.milestones.includes(ev.data.phase)
        ? run
        : { ...run, milestones: [...run.milestones, ev.data.phase] };
    case "authWarning":
      return { ...run, warnings: [...run.warnings, `auth: billing via ${ev.data.source}`] };
    case "warning":
      return { ...run, warnings: [...run.warnings, ev.data.message] };
    case "fatal":
      return {
        ...run,
        status: "error",
        warnings: [...run.warnings, `fatal(${ev.data.kind}): ${ev.data.message}`],
      };
    default:
      return run;
  }
}

export const useEngineStore = create<EngineState>((set) => ({
  runs: {},
  start: (slug) =>
    set((s) => ({
      runs: { ...s.runs, [slug]: { ...EMPTY_RUN, status: "running", startedAt: Date.now() } },
    })),
  apply: (slug, ev) =>
    set((s) => ({
      runs: { ...s.runs, [slug]: reduceRun(s.runs[slug] ?? EMPTY_RUN, ev) },
    })),
  reset: (slug) =>
    set((s) => {
      if (slug == null) return { runs: {} };
      if (!(slug in s.runs)) return {};
      const next = { ...s.runs };
      delete next[slug];
      return { runs: next };
    }),
}));

/** This subject's run (EMPTY when it has never run). */
export function useRun(slug: string | null | undefined): RunState {
  return useEngineStore((s) => (slug ? (s.runs[slug] ?? EMPTY_RUN) : EMPTY_RUN));
}

/** Whether this subject currently has a turn in flight — the per-subject gate. */
export function useIsBusy(slug: string | null | undefined): boolean {
  return useEngineStore((s) => (slug ? s.runs[slug]?.status === "running" : false));
}

/** Slugs with a turn in flight (shallow-compared so it only changes when the set does). */
export function useAnyRunning(): string[] {
  return useEngineStore(
    useShallow((s) => Object.keys(s.runs).filter((k) => s.runs[k].status === "running")),
  );
}
