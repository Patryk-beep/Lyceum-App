import { useState } from "react";

import { useEngineStore } from "../stores/useEngineStore";
import { SessionConsole } from "./SessionConsole";

/** Global collapsible right-edge live-session drawer (persists across nav). */
export function SessionDrawer() {
  const [open, setOpen] = useState(true);
  const status = useEngineStore((s) => s.status);

  return (
    <aside className={`session-drawer ${open ? "is-open" : "is-closed"}`}>
      <button
        className="session-drawer__toggle"
        onClick={() => setOpen((v) => !v)}
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
