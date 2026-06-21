import { useEffect, useState } from "react";

import { useAnyRunning, useRun } from "../stores/useEngineStore";
import { SessionConsole } from "./SessionConsole";

/** Global collapsible right-edge live-session drawer (persists across nav).
 *  Shows the current subject's run, or any running one (e.g. the diagnostics
 *  smoke) when off a subject route. Default closed; auto-opens while it runs. */
export function SessionDrawer({ slug }: { slug?: string | null }) {
  const [open, setOpen] = useState(false);
  const running = useAnyRunning();
  const shown = slug ?? running[0] ?? null;
  const status = useRun(shown).status;

  useEffect(() => {
    if (status === "running") setOpen(true);
  }, [status]);

  return (
    <aside
      className={`session-drawer ${open ? "is-open" : "is-closed"}`}
      aria-label="Live session"
    >
      <button
        className="session-drawer__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Collapse live session" : "Expand live session"}
        aria-expanded={open}
        title={open ? "Collapse live session" : "Expand live session"}
      >
        {open ? "›" : "‹"}
        <span className={`session-drawer__pip session-drawer__pip--${status}`} />
      </button>
      {open && (
        <div className="session-drawer__body">
          <div className="session-drawer__header">Live session</div>
          <SessionConsole slug={shown} />
        </div>
      )}
    </aside>
  );
}
