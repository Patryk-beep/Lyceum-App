import { useLocation, useNavigate } from "react-router-dom";

import { useStreak } from "../lib/query";
import { useSessionSubscription } from "../lib/useSession";
import { SessionDrawer } from "./SessionDrawer";
import { Sigil } from "./Sigil";
import { StreakCard } from "./StreakCard";

const NAV = [
  { to: "/library", label: "Library" },
  { to: "/new", label: "New subject" },
  { to: "/review", label: "Review" },
  { to: "/today", label: "Today" },
  { to: "/analytics", label: "Analytics" },
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  useSessionSubscription();
  const { data: streak } = useStreak();

  return (
    <div className="app-shell">
      <div className="window-chrome" data-tauri-drag-region>
        <span className="window-chrome__brand">lyceum</span>
        <span>· learning/ · local workspace</span>
      </div>
      <div className="app-shell__body">
        <nav className="sidebar">
          <div className="sidebar__brand">
            <Sigil size={30} />
            <span className="sidebar__brand-name">Lyceum</span>
          </div>
          {NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <div
                key={item.to}
                className={
                  "sidebar__item" + (active ? " sidebar__item--active" : "")
                }
                onClick={() => navigate(item.to)}
              >
                {item.label}
              </div>
            );
          })}
          <div className="sidebar__foot">
            <StreakCard days={streak?.current ?? 0} />
          </div>
        </nav>
        <main className="content">{children}</main>
        <SessionDrawer />
      </div>
    </div>
  );
}
