import { useLocation, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/library", label: "Library" },
  { to: "/review", label: "Review" },
  { to: "/today", label: "Today" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="app-shell">
      <div className="window-chrome" data-tauri-drag-region>
        <span className="window-chrome__brand">lyceum</span>
        <span>· learning/ · local workspace</span>
      </div>
      <div className="app-shell__body">
        <nav className="sidebar">
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
        </nav>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
