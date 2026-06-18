import { useEffect } from "react";

import { useEngineStore } from "../stores/useEngineStore";
import { subscribeSession } from "./engine";

/** Subscribe the engine store to the live `claude://session` stream (app-global). */
export function useSessionSubscription() {
  const apply = useEngineStore((s) => s.apply);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    subscribeSession((ev) => apply(ev))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Not running inside Tauri (e.g. plain browser preview) — no live stream.
      });
    return () => unlisten?.();
  }, [apply]);
}
