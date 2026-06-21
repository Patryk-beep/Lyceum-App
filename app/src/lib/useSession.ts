import { useEffect } from "react";

import { useEngineStore } from "../stores/useEngineStore";
import { subscribeSession } from "./engine";

/** Subscribe the engine store to the live `claude://session` stream (app-global). */
export function useSessionSubscription() {
  const apply = useEngineStore((s) => s.apply);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // `listen()` is async, but the effect can be torn down (StrictMode's
    // mount→cleanup→mount, or a fast remount) BEFORE it resolves. Without this
    // guard the cleanup runs while `unlisten` is still undefined, the first
    // listener leaks, and a second is added — so every event is applied twice
    // (doubled stream text + duplicated tool rows). Unlisten on resolve if torn down.
    let cancelled = false;
    subscribeSession((slug, ev) => apply(slug, ev))
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Not running inside Tauri (e.g. plain browser preview) — no live stream.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [apply]);
}
