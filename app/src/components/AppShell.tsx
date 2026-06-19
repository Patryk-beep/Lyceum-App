import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useResumeRecorder } from "../hooks/useResumeState";
import { useManifest } from "../lib/query";
import { useSessionSubscription } from "../lib/useSession";
import { pageLabel, parseSubjectRoute } from "../theme/loop";
import { AppSidebar } from "./AppSidebar";
import { Breadcrumb } from "./Breadcrumb";
import { CommandPalette } from "./CommandPalette";
import { SessionDrawer } from "./SessionDrawer";

const COLLAPSE_KEY = "lyceum-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useSessionSubscription();
  useResumeRecorder();

  const { slug } = parseSubjectRoute(pathname);
  const { data: manifest } = useManifest(slug ?? "");
  const subjectName = manifest?.subject ?? null;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* best-effort */
      }
      return next;
    });
  }, []);

  // The palette is a Radix dialog with no Dialog.Trigger, so it can't restore
  // focus to the opener itself — capture it on open, return it on close (WCAG 2.4.3).
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const openPalette = useCallback(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setPaletteOpen(true);
  }, []);
  useEffect(() => {
    if (!paletteOpen && restoreFocusRef.current) {
      restoreFocusRef.current.focus?.();
      restoreFocusRef.current = null;
    }
  }, [paletteOpen]);

  // Global accelerators: ⌘K/Ctrl+K toggles the palette, ⌘B/Ctrl+B collapses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette();
      } else if (k === "b") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapse, openPalette, paletteOpen]);

  // Route-change focus management (the #1 SPA a11y miss): move focus to <main> on
  // navigation so keyboard/SR users land on the new content, not stuck up-tree.
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar" data-tauri-drag-region>
        <button
          className="topbar__toggle"
          onClick={toggleCollapse}
          aria-label="Toggle sidebar"
          aria-controls="app-sidebar"
          aria-expanded={!collapsed}
          title="Toggle sidebar (⌘B)"
        >
          ☰
        </button>
        <span className="topbar__brand window-chrome__brand">lyceum</span>
        <Breadcrumb pathname={pathname} subjectName={subjectName} />
        <div className="topbar__spacer" />
        <button
          className="topbar__kbd"
          onClick={openPalette}
          aria-label="Open command palette"
          title="Command palette (⌘K)"
        >
          ⌘K
        </button>
        <button
          className="topbar__gear"
          onClick={() => navigate("/settings")}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <div
        className={
          "app-shell__body" + (collapsed ? " app-shell__body--collapsed" : "")
        }
      >
        <AppSidebar collapsed={collapsed} />
        <main
          id="main-content"
          className="content"
          tabIndex={-1}
          ref={mainRef}
          aria-label="Main content"
        >
          {children}
        </main>
        <SessionDrawer />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="route-announcer"
      >
        {pageLabel(pathname, subjectName)}
      </div>
    </div>
  );
}
