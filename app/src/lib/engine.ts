import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  BridgeEvent,
  DoctorReport,
  PreflightReport,
  SessionEnvelope,
  TutorEnvelope,
} from "./types";

export const engineApi = {
  preflight: () => invoke<PreflightReport>("preflight"),
  doctor: () => invoke<DoctorReport>("claude_doctor"),
  smoke: (prompt: string) => invoke<string>("claude_smoke", { prompt }),
};

/** Subscribe to the live `claude://session` stream. Each event is tagged with the
 *  subject slug it belongs to. Returns an unlisten fn. */
export function subscribeSession(
  onEvent: (slug: string, ev: BridgeEvent) => void,
): Promise<UnlistenFn> {
  return listen<SessionEnvelope>("claude://session", (e) =>
    onEvent(e.payload.slug, e.payload.event),
  );
}

/** Subscribe to the live `claude://tutor` stream — the read-only tutor's turns, kept on their
 *  own channel so they never land in the skill engine store. Returns an unlisten fn. */
export function subscribeTutor(
  onEvent: (slug: string, ev: BridgeEvent) => void,
): Promise<UnlistenFn> {
  return listen<TutorEnvelope>("claude://tutor", (e) =>
    onEvent(e.payload.slug, e.payload.event),
  );
}
