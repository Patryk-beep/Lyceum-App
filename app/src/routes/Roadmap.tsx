import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { ConfirmDestructive } from "../components/ConfirmDestructive";
import { MasterySeal, type SealState } from "../components/MasterySeal";
import { MasteryMeter } from "../components/MasteryMeter";
import { RemediationNotice } from "../components/RemediationNotice";
import { api } from "../lib/ipc";
import { useManifest, useNextStep, useResetCurriculum } from "../lib/query";
import { currentWeakObjectives } from "../lib/remediation";
import type { Manifest, Module, Objective } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

function meanMastery(m: Module): number | null {
  const scored = m.objectives
    .map((o) => o.mastery)
    .filter((v): v is number => v != null);
  return scored.length
    ? scored.reduce((a, b) => a + b, 0) / scored.length
    : null;
}

function sealState(m: Module, currentId?: string): SealState {
  if (m.status === "mastered") return "earned";
  if (m.id === currentId) return "active";
  if (m.status === "locked") return "locked";
  return "available";
}

export function RoadmapView({
  manifest,
  onRunStep,
  running = false,
  remediation = null,
}: {
  manifest: Manifest;
  onRunStep?: () => void;
  running?: boolean;
  /** Gate-failing objectives when the next step is remediation — drives the notice + the
   *  CTA label. `null`/empty ⇒ the normal "Run next step" affordance. */
  remediation?: Objective[] | null;
}) {
  const remediating = !!remediation && remediation.length > 0;
  const currentId = manifest.current.moduleId;
  // Mirror the core's `Manifest::display_level()`: explicit level, else a numeric
  // scale.start, else 1 (a "test" start has no level until placement runs). The
  // raw manifest omits `current.level` when it is null, so guard against undefined.
  const displayLevel =
    manifest.current.level ??
    (typeof manifest.scale.start === "number" ? manifest.scale.start : 1);
  return (
    <div className="roadmap" data-testid="roadmap">
      <header className="roadmap__header">
        <h1>{manifest.subject}</h1>
        <div className="muted metric">
          Level {displayLevel} → target {manifest.scale.target} ·{" "}
          {manifest.current.status}
        </div>
      </header>

      {remediating && <RemediationNotice objectives={remediation!} />}

      <button
        className="btn btn--primary"
        onClick={onRunStep}
        disabled={running}
        style={{ marginBottom: 18 }}
      >
        {running
          ? "Working…"
          : remediating
            ? "Revisit the tricky parts"
            : "Run next step"}
      </button>

      <ol className="roadmap__timeline">
        {manifest.modules.map((m) => {
          const state = sealState(m, currentId);
          const mm = meanMastery(m);
          return (
            <li
              key={m.id}
              className={`roadmap-node roadmap-node--${state}`}
              data-testid="roadmap-node"
              data-state={state}
            >
              <div className="roadmap-node__rail">
                <MasterySeal state={state} />
              </div>
              <div className="roadmap-node__body card">
                <div className="roadmap-node__title">
                  {m.id} — {m.title}
                </div>
                <div className="roadmap-node__meta muted metric">
                  L{m.level} · {m.status} · {m.taught ? "taught" : "not taught"}
                </div>
                <div style={{ marginTop: 8 }}>
                  <MasteryMeter value={mm} threshold={m.masteryThreshold} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Roadmap() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const { data: manifest, isLoading, error } = useManifest(slug);
  // Advisory: the authoritative next route. `run_subject_step` re-derives at run time, so a
  // failed/loading fetch must never block the run — it just falls back to "Run next step".
  const { data: route } = useNextStep(slug);
  const engineStart = useEngineStore((s) => s.start);
  const reset = useResetCurriculum(slug);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const step = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["review", slug] });
      qc.invalidateQueries({ queryKey: ["analytics", slug] });
      qc.invalidateQueries({ queryKey: ["nextStep", slug] });
    },
  });

  if (isLoading) return <div className="muted">Loading subject…</div>;
  if (error || !manifest)
    return <div className="muted">Could not load subject: {String(error)}</div>;

  const remediation =
    route?.kind === "remediate" ? currentWeakObjectives(manifest) : null;

  return (
    <>
      <RoadmapView
        manifest={manifest}
        onRunStep={() => step.mutate()}
        running={step.isPending}
        remediation={remediation}
      />
      <div className="danger-zone">
        <div className="danger-zone__label">Danger zone</div>
        <button
          className="btn btn--outline"
          style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          onClick={() => setConfirmingReset(true)}
        >
          Reset curriculum
        </button>
      </div>
      {confirmingReset && (
        <ConfirmDestructive
          title={`Reset the curriculum for “${manifest.subject}”?`}
          body="This deletes all modules and assignments and re-builds from scratch on the next step. Your spaced-review schedule is kept but unlinked from the old modules."
          danger="Mastery scores in those modules are lost. This cannot be undone."
          confirmWord={manifest.slug}
          confirmLabel="Reset curriculum"
          busy={reset.isPending}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                useEngineStore.getState().reset(slug);
                setConfirmingReset(false);
              },
            })
          }
        />
      )}
    </>
  );
}
