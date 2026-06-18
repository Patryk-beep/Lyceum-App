import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { BridgeEvent, DoctorReport, PreflightReport } from "./types";

export const engineApi = {
  preflight: () => invoke<PreflightReport>("preflight"),
  doctor: () => invoke<DoctorReport>("claude_doctor"),
  smoke: (prompt: string) => invoke<string>("claude_smoke", { prompt }),
};

/** Subscribe to the live `claude://session` stream. Returns an unlisten fn. */
export function subscribeSession(
  onEvent: (ev: BridgeEvent) => void,
): Promise<UnlistenFn> {
  return listen<BridgeEvent>("claude://session", (e) => onEvent(e.payload));
}
