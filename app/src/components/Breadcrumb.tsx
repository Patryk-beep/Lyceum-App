import { Link } from "react-router-dom";

import { crumbsFor } from "../theme/loop";

/** Top-bar breadcrumb. Renders nothing on global pages and the subject hub —
 *  only at depth >= 3, where context would otherwise be lost (NN/G). */
export function Breadcrumb({
  pathname,
  subjectName,
}: {
  pathname: string;
  subjectName?: string | null;
}) {
  const crumbs = crumbsFor(pathname, subjectName);
  if (crumbs.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumb" data-testid="breadcrumb">
      <ol className="breadcrumb__list">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className="breadcrumb__item">
              {c.to && !last ? (
                <Link to={c.to} className="breadcrumb__link">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{c.label}</span>
              )}
              {!last && (
                <span className="breadcrumb__sep" aria-hidden="true">
                  ▸
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
