// The per-subject "learning loop" — the spine rendered in the sidebar that is
// both navigation and a progress indicator (Duolingo-style path). Pure + testable;
// no Date / no React so the state logic can be unit-tested against a fixture.

import type { Manifest } from "../lib/types";

export type LoopKey =
  | "research"
  | "placement"
  | "lessons"
  | "assignments"
  | "review"
  | "capstone";

/** done = ✓ behind you · current = ● where you are · todo = ○ ahead. */
export type LoopStatus = "done" | "current" | "todo";

export interface LoopStage {
  key: LoopKey;
  label: string;
  /** Path segment under /subject/:slug ("" would be the hub, unused here). */
  seg: string;
  status: LoopStatus;
  /** Optional count badge (e.g. reviews due) shown on the row. */
  badge?: number;
}

const ORDER: { key: LoopKey; label: string; seg: string }[] = [
  { key: "research", label: "Research", seg: "research" },
  { key: "placement", label: "Placement", seg: "placement" },
  { key: "lessons", label: "Lessons", seg: "lessons" },
  { key: "assignments", label: "Assignments", seg: "assignments" },
  { key: "review", label: "Review", seg: "review" },
  { key: "capstone", label: "Capstone", seg: "capstone" },
];

function placementTaken(m: Manifest): boolean {
  const p = (m as { placement?: { taken?: boolean } }).placement;
  // A numeric start means the learner skipped the placement probe; "test" defers it.
  return !!p?.taken || m.scale.start !== "test";
}

function certified(m: Manifest): boolean {
  const c = m.certification as { certified?: boolean } | null | undefined;
  return !!c?.certified;
}

/** Which loop stage the learner is *currently working on* (the ● marker). Honest
 *  heuristic from the manifest — the core's phase enum is the post-curriculum set
 *  {teach, assign, remediate, assess, capstone}; pre-curriculum is inferred. */
export function currentLoopKey(m: Manifest): LoopKey {
  if (!placementTaken(m)) return "placement";
  if (m.modules.length === 0) return "research";
  if (certified(m)) return "capstone";
  switch (m.current.phase) {
    case "assign":
    case "remediate":
    case "assess":
      return "assignments";
    case "capstone":
      return "capstone";
    case "teach":
    default:
      return "lessons";
  }
}

/** Per-stage completion signal — positive evidence only, never faked. */
function isDone(key: LoopKey, m: Manifest): boolean {
  switch (key) {
    case "research":
      return m.modules.length > 0;
    case "placement":
      return placementTaken(m);
    case "lessons":
      return m.modules.some((mod) => mod.taught);
    case "assignments":
      // You've been assessed and mastered at least one module.
      return m.modules.some((mod) => mod.status === "mastered");
    case "review":
      return false; // ongoing — never "behind you"
    case "capstone":
      return certified(m);
  }
}

/** Build the six-stage spine for a subject. `reviewsDue` (from the subject summary)
 *  badges the Review row; pass undefined to omit it. */
export function loopStages(
  m: Manifest,
  opts: { reviewsDue?: number } = {},
): LoopStage[] {
  const current = currentLoopKey(m);
  const done = certified(m);
  return ORDER.map(({ key, label, seg }) => {
    // A certified subject is finished: show ✓ on capstone, not ● — nothing is
    // "current" once the journey is done.
    const isCurrent = key === current && !(key === "capstone" && done);
    const status: LoopStatus = isCurrent
      ? "current"
      : isDone(key, m)
        ? "done"
        : "todo";
    const badge =
      key === "review" && opts.reviewsDue ? opts.reviewsDue : undefined;
    return { key, label, seg, status, badge };
  });
}

/** Map a route path segment to the loop key it belongs to (for highlighting the
 *  current page in the spine). Reader/detail sub-routes fold into their list. */
export function segToLoopKey(seg: string | undefined): LoopKey | null {
  switch (seg) {
    case "research":
      return "research";
    case "placement":
      return "placement";
    case "lessons":
    case "lesson":
      return "lessons";
    case "assignments":
    case "assignment":
      return "assignments";
    case "review":
      return "review";
    case "capstone":
      return "capstone";
    default:
      return null; // hub, analytics, artifact — not a spine row
  }
}

/** Parse `/subject/:slug/:seg?/...` → the active subject slug + spine key. */
export function parseSubjectRoute(pathname: string): {
  slug: string | null;
  seg: string | null;
  activeKey: LoopKey | null;
} {
  const m = pathname.match(/^\/subject\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return { slug: null, seg: null, activeKey: null };
  const slug = decodeURIComponent(m[1]);
  const seg = m[2] ?? null;
  return { slug, seg, activeKey: segToLoopKey(seg ?? undefined) };
}

// ---- Breadcrumbs (rendered in the top bar at depth >= 3) ----

export interface Crumb {
  label: string;
  /** Link target; omit on the final (current) crumb. */
  to?: string;
}

const SEG_LABEL: Record<string, string> = {
  research: "Research",
  placement: "Placement",
  lessons: "Lessons",
  lesson: "Lessons",
  assignments: "Assignments",
  assignment: "Assignments",
  review: "Review",
  capstone: "Capstone",
  analytics: "Analytics",
  artifact: "Artifact",
};

const GLOBAL_LABEL: Record<string, string> = {
  "/library": "Library",
  "/review": "Review",
  "/analytics": "Analytics",
  "/new": "New subject",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

/** Human label for the current page (used for the a11y live announcement). */
export function pageLabel(pathname: string, subjectName?: string | null): string {
  const { slug, seg } = parseSubjectRoute(pathname);
  if (slug) {
    if (!seg) return subjectName ?? slug;
    return SEG_LABEL[seg] ?? subjectName ?? slug;
  }
  return GLOBAL_LABEL[pathname] ?? "Lyceum";
}

/** Trail for a subject page. Returns [] for global pages and the subject hub
 *  (depth < 3) — the sidebar already shows where those are. */
export function crumbsFor(
  pathname: string,
  subjectName?: string | null,
): Crumb[] {
  const { slug, seg } = parseSubjectRoute(pathname);
  if (!slug || !seg) return [];

  // A detail segment (lesson/assignment) links its crumb to the canonical list
  // route (lessons/assignments), not the raw singular segment. `artifact/*` has
  // no list route, so its stage crumb is a plain (non-linking) label.
  const stageSeg = segToLoopKey(seg) ?? seg;
  const routable = segToLoopKey(seg) !== null || seg === "analytics";
  const crumbs: Crumb[] = [
    { label: "Library", to: "/library" },
    { label: subjectName ?? slug, to: `/subject/${slug}` },
    {
      label: SEG_LABEL[seg] ?? seg,
      to: routable ? `/subject/${slug}/${stageSeg}` : undefined,
    },
  ];

  // A deeper leaf (lesson file / assignment id / artifact path) becomes the
  // current crumb, and the stage crumb above it stays a link.
  const parts = pathname.split("/").filter(Boolean); // ["subject", slug, seg, ...rest]
  const rest = parts.slice(3);
  if (rest.length > 0) {
    const leaf = decodeURIComponent(rest.join("/"));
    crumbs.push({ label: leaf });
  } else {
    // The stage page itself is current — drop its link.
    crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label };
  }
  return crumbs;
}
