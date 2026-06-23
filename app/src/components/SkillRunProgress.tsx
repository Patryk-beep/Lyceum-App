import { useElapsed } from "../hooks/useElapsed";
import type { Manifest } from "../lib/types";
import { useRun } from "../stores/useEngineStore";
import { SessionConsole } from "./SessionConsole";

/** A descriptive label for whatever skill turn the engine is about to run, derived
 *  from manifest state (better than a generic "Loading…", per the research). */
export function skillLabel(manifest?: Manifest): string {
  if (!manifest) return "Working…";
  if (manifest.modules.length === 0) return "Researching the subject";
  switch (manifest.current.phase) {
    case "teach":
      return "Teaching the next lesson";
    case "assign":
      return "Preparing your assignment";
    case "assess":
      return "Assessing your work";
    case "remediate":
      return "Revisiting the tricky parts";
    case "capstone":
      return "Running the capstone";
    default:
      return "Working…";
  }
}

const STATUS_TEXT: Record<string, string> = {
  running: "in progress",
  done: "finished",
  error: "error",
  idle: "",
};

/** The generalized live skill-run surface: an active-skill header (label + status
 *  + elapsed timer) above the streamed console. Used inside the blocking overlay. */
export function SkillRunProgress({ slug, label }: { slug: string; label: string }) {
  const run = useRun(slug);
  const elapsed = useElapsed(run.startedAt, run.status === "running");

  return (
    <div className="skill-run" data-testid="skill-run">
      <div className="skill-run__head">
        <span
          className={`skill-run__dot skill-run__dot--${run.status}`}
          aria-hidden="true"
        />
        <span className="skill-run__label">{label}</span>
        <span className="skill-run__status metric">{STATUS_TEXT[run.status]}</span>
        <span className="skill-run__elapsed metric" aria-label="elapsed time">
          {elapsed}
        </span>
      </div>
      <SessionConsole slug={slug} />
    </div>
  );
}
