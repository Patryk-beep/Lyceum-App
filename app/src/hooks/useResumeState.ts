// Per-subject "resume where you left off". Records the last route visited inside
// each subject to localStorage (crash-safe: written on navigate, not on quit) so
// the Library hero and the ⌘K palette can drop the learner back in one action.
//
// ponytail: localStorage now; migrate to the Tauri store/SQLite later if durable
// cross-machine resume is wanted.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const KEY = "lyceum-resume";

export interface ResumeEntry {
  slug: string;
  route: string;
  ts: number;
}

type ResumeMap = Record<string, { route: string; ts: number }>;

function read(): ResumeMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ResumeMap) : {};
  } catch {
    return {};
  }
}

function write(map: ResumeMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota — resume is best-effort */
  }
}

/** Slug of the subject a path belongs to, or null for global routes. */
function slugOf(pathname: string): string | null {
  const m = pathname.match(/^\/subject\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function recordRoute(pathname: string, now: number): void {
  const slug = slugOf(pathname);
  if (!slug) return;
  const map = read();
  map[slug] = { route: pathname, ts: now };
  write(map);
}

/** The stored route for a subject, or its hub if none recorded. */
export function resumeRoute(slug: string): string {
  return read()[slug]?.route ?? `/subject/${slug}`;
}

/** All recorded subjects, most-recently-visited first. */
export function recentSubjects(): ResumeEntry[] {
  return Object.entries(read())
    .map(([slug, v]) => ({ slug, route: v.route, ts: v.ts }))
    .sort((a, b) => b.ts - a.ts);
}

/** The most-recently-touched subject's slug, or null. */
export function lastSubject(): string | null {
  return recentSubjects()[0]?.slug ?? null;
}

/** Drop a subject's resume entry — call when the subject is deleted so it stops
 *  surfacing as a stale "Continue …" in the palette. */
export function forgetSubject(slug: string): void {
  const map = read();
  if (slug in map) {
    delete map[slug];
    write(map);
  }
}

/** Mount in the shell: persists the current subject route on every navigation. */
export function useResumeRecorder(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    recordRoute(pathname, Date.now());
  }, [pathname]);
}
