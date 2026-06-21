import { useEffect, useRef } from "react";

import type { Manifest } from "../lib/types";
import { useIsBusy } from "../stores/useEngineStore";
import { SkillRunProgress, skillLabel } from "./SkillRunProgress";

/** Non-dismissible blocking overlay shown over a subject's content while one of its
 *  skill turns runs. It bars interaction structurally (the content behind it is set
 *  `inert` by AppShell); here it traps focus on the panel and announces the wait.
 *  Per-subject: other subjects stay usable, so the note invites switching. */
export function SkillRunOverlay({ slug, manifest }: { slug: string; manifest?: Manifest }) {
  const busy = useIsBusy(slug);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture the opener on entry, move focus to the panel, restore it on exit (WCAG 2.4.3).
  useEffect(() => {
    if (busy) {
      openerRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else if (openerRef.current) {
      openerRef.current.focus?.();
      openerRef.current = null;
    }
  }, [busy]);

  if (!busy) return null;
  const label = skillLabel(manifest);

  return (
    <div
      className="skill-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — please wait`}
      data-testid="skill-overlay"
    >
      <div className="skill-overlay__panel card" ref={panelRef} tabIndex={-1}>
        <SkillRunProgress slug={slug} label={label} />
        <p className="skill-overlay__note muted">
          This runs to completion (about a minute) and can’t be interrupted. You can
          switch to another subject in the sidebar while it works.
        </p>
      </div>
    </div>
  );
}
