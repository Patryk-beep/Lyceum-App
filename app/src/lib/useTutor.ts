import { useEffect } from "react";

import { useTutorStore } from "../stores/useTutorStore";
import { subscribeTutor } from "./engine";

/** Subscribe the tutor store to the live `claude://tutor` stream (app-global). Mirrors
 *  `useSessionSubscription`'s StrictMode guard: `listen()` is async, so if the effect is torn
 *  down before it resolves (StrictMode mount→cleanup→mount), unlisten on resolve — otherwise
 *  two listeners survive and every streamed token is applied twice. */
export function useTutorSubscription() {
  const apply = useTutorStore((s) => s.apply);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    subscribeTutor((slug, ev) => apply(slug, ev))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Not running inside Tauri (browser preview) — no live tutor stream.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply]);
}
