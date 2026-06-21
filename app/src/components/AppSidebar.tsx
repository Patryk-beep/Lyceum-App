import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useManifest, useStreak, useSubjects } from "../lib/query";
import type { SubjectSummary } from "../lib/types";
import { useAnyRunning } from "../stores/useEngineStore";
import { loopStages, parseSubjectRoute, type LoopStage } from "../theme/loop";
import { resumeRoute } from "../hooks/useResumeState";
import { Sigil } from "./Sigil";
import { StreakCard } from "./StreakCard";
import { SubjectLoopNav } from "./SubjectLoopNav";

const GLOBAL_NAV = [
  { to: "/library", label: "Library" },
  { to: "/review", label: "Review" },
  { to: "/analytics", label: "Analytics" },
  { to: "/new", label: "New subject" },
];

const FOOT_NAV = [
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/settings", label: "Settings" },
];

/** A global nav row is active on an exact match (or its sub-paths), but never on
 *  a /subject/* page — those are owned by the loop spine. "/" counts as Library. */
function globalActive(pathname: string, to: string): boolean {
  if (pathname.startsWith("/subject/")) return false;
  if (to === "/library") return pathname === "/" || pathname.startsWith("/library");
  return pathname === to || pathname.startsWith(to + "/");
}

/** Inline subject quick-switcher: current subject ▾ → 1-click jump (to that
 *  subject's resume route) without the Library detour. WAI-ARIA *disclosure*
 *  pattern (button + revealed list of buttons) — not a listbox, so the list may
 *  legitimately own interactive buttons and Tab order is the expected nav. */
function SubjectSwitcher({
  subjectName,
  subjects,
  runningSlugs,
  onPick,
  hidden = false,
}: {
  subjectName: string;
  subjects: SubjectSummary[];
  runningSlugs: string[];
  onPick: (slug: string) => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Don't leave a popover armed when the sidebar collapses out of view.
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  return (
    <div
      className="subject-switcher"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        className="subject-switcher__current"
        data-testid="subject-switcher"
        aria-controls="subject-switcher-list"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="subject-switcher__name">{subjectName}</span>
        <span className="subject-switcher__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <>
          <button
            className="subject-switcher__backdrop"
            aria-label="Close subject switcher"
            onClick={() => setOpen(false)}
          />
          <ul
            id="subject-switcher-list"
            className="subject-switcher__list"
            aria-label="Switch subject"
          >
            {subjects.map((s) => (
              <li key={s.slug}>
                <button
                  className="subject-switcher__option"
                  aria-current={s.subject === subjectName ? "true" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onPick(s.slug);
                  }}
                >
                  {s.subject}
                  {runningSlugs.includes(s.slug) && (
                    <span
                      className="sidebar__run-pip"
                      aria-label="running"
                      title="A skill turn is running"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function AppSidebarView({
  pathname,
  slug,
  activeKey,
  stages,
  subjects,
  subjectName,
  streakDays,
  runningSlugs = [],
  onNavigate,
  hidden = false,
}: {
  pathname: string;
  slug: string | null;
  activeKey: ReturnType<typeof parseSubjectRoute>["activeKey"];
  stages: LoopStage[];
  subjects: SubjectSummary[];
  subjectName: string | null;
  streakDays: number;
  runningSlugs?: string[];
  onNavigate: (to: string) => void;
  hidden?: boolean;
}) {
  return (
    <div className="sidebar" id="app-sidebar" data-testid="app-sidebar">
      <div className="sidebar__brand">
        <Sigil size={28} />
        <span className="sidebar__brand-name">Lyceum</span>
      </div>

      <nav aria-label="Primary" className="sidebar__zone">
        {GLOBAL_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={
              "sidebar__item" +
              (globalActive(pathname, item.to) ? " sidebar__item--active" : "")
            }
            aria-current={globalActive(pathname, item.to) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {slug && (
        <nav aria-label="Subject" className="sidebar__zone sidebar__zone--subject">
          <SubjectSwitcher
            subjectName={subjectName ?? slug}
            subjects={subjects}
            runningSlugs={runningSlugs}
            onPick={onNavigate}
            hidden={hidden}
          />
          <Link
            to={`/subject/${slug}`}
            className={
              "sidebar__item sidebar__item--overview" +
              (pathname === `/subject/${slug}` ? " sidebar__item--active" : "")
            }
            aria-current={pathname === `/subject/${slug}` ? "page" : undefined}
            data-testid="loop-overview"
          >
            Overview
            {runningSlugs.includes(slug) && (
              <span
                className="sidebar__run-pip"
                aria-label="running"
                title="A skill turn is running"
              />
            )}
          </Link>
          {stages.length > 0 && (
            <SubjectLoopNav slug={slug} stages={stages} activeKey={activeKey} />
          )}
          <Link
            to={`/subject/${slug}/analytics`}
            className={
              "sidebar__item sidebar__item--tool" +
              (pathname === `/subject/${slug}/analytics`
                ? " sidebar__item--active"
                : "")
            }
            aria-current={
              pathname === `/subject/${slug}/analytics` ? "page" : undefined
            }
          >
            Analytics
          </Link>
        </nav>
      )}

      <nav aria-label="Settings" className="sidebar__zone sidebar__foot-nav">
        {FOOT_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={
              "sidebar__item" +
              (globalActive(pathname, item.to) ? " sidebar__item--active" : "")
            }
            aria-current={globalActive(pathname, item.to) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <div className="sidebar__foot">
          <StreakCard days={streakDays} />
        </div>
      </nav>
    </div>
  );
}

/** Container: derives the active subject + loop state from the route and feeds
 *  the presentational sidebar. Rendered once in AppShell, outside <Routes>, so it
 *  reads the slug from the pathname rather than useParams. */
export function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { slug, activeKey } = parseSubjectRoute(pathname);
  const { data: subjects } = useSubjects();
  const { data: manifest } = useManifest(slug ?? "");
  const { data: streak } = useStreak();
  const runningSlugs = useAnyRunning();

  const summary = subjects?.find((s) => s.slug === slug);
  const stages =
    slug && manifest
      ? loopStages(manifest, { reviewsDue: summary?.reviewsDue })
      : [];

  return (
    <AppSidebarView
      pathname={pathname}
      slug={slug}
      activeKey={activeKey}
      stages={stages}
      subjects={subjects ?? []}
      subjectName={manifest?.subject ?? summary?.subject ?? null}
      streakDays={streak?.current ?? 0}
      runningSlugs={runningSlugs}
      onNavigate={(s) => navigate(resumeRoute(s))}
      hidden={collapsed}
    />
  );
}
