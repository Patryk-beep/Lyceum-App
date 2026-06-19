import { useEffect, useState } from "react";

import { useEngineStore } from "../stores/useEngineStore";
import { SessionConsole } from "./SessionConsole";

/** Global collapsible right-edge live-session drawer (persists across nav).
 *  Default closed so it never obscures content; auto-opens while a step runs. */
export function SessionDrawer() {
  const [open, setOpen] = useState(false);
  const status = useEngineStore((s) => s.status);

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
          <SessionConsole />
        </div>
      )}
    </aside>
  );
}
