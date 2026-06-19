import { Link } from "react-router-dom";

import type { LoopKey, LoopStage } from "../theme/loop";

const GLYPH: Record<LoopStage["status"], string> = {
  done: "✓",
  current: "●",
  todo: "○",
};

/** The vertical learning-loop spine: each stage is a link AND a progress marker.
 *  `activeKey` is the route you're viewing (highlight + aria-current); `status`
 *  on each stage is journey progress (independent of which page is open). */
export function SubjectLoopNav({
  slug,
  stages,
  activeKey,
}: {
  slug: string;
  stages: LoopStage[];
  activeKey: LoopKey | null;
}) {
  return (
    <ul className="loop-nav" data-testid="loop-nav">
      {stages.map((s) => {
        const isActive = s.key === activeKey;
        return (
          <li key={s.key}>
            <Link
              to={`/subject/${slug}/${s.seg}`}
              className={
                "loop-nav__item" + (isActive ? " loop-nav__item--active" : "")
              }
              aria-current={isActive ? "page" : undefined}
              data-testid={`loop-${s.key}`}
              data-status={s.status}
            >
              <span
                className={`loop-nav__glyph loop-nav__glyph--${s.status}`}
                aria-hidden="true"
              >
                {GLYPH[s.status]}
              </span>
              <span className="loop-nav__label">{s.label}</span>
              {s.badge ? (
                <span className="loop-nav__badge" aria-label={`${s.badge} due`}>
                  {s.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
