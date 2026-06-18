import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { MasterySeal, type SealState } from "../components/MasterySeal";
import { MasteryMeter } from "../components/MasteryMeter";
import { api } from "../lib/ipc";
import { useManifest } from "../lib/query";
import type { Manifest, Module } from "../lib/types";
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
}: {
  manifest: Manifest;
  onRunStep?: () => void;
  running?: boolean;
}) {
  const currentId = manifest.current.moduleId;
  return (
    <div className="roadmap" data-testid="roadmap">
      <header className="roadmap__header">
        <h1>{manifest.subject}</h1>
        <div className="muted metric">
          Level {manifest.current.level} → target {manifest.scale.target} ·{" "}
          {manifest.current.status}
        </div>
      </header>

      <div className="roadmap__subnav">
        <Link to={`/subject/${manifest.slug}/research`}>Research</Link>
        <Link to={`/subject/${manifest.slug}/placement`}>Placement</Link>
        <Link to={`/subject/${manifest.slug}/analytics`}>Analytics</Link>
        <Link to={`/subject/${manifest.slug}/capstone`}>Capstone</Link>
      </div>

      <button
        className="btn btn--primary"
        onClick={onRunStep}
        disabled={running}
        style={{ marginBottom: 18 }}
      >
        {running ? "Working…" : "Run next step"}
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
  const engineStart = useEngineStore((s) => s.start);

  const step = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["review", slug] });
    },
  });

  if (isLoading) return <div className="muted">Loading subject…</div>;
  if (error || !manifest)
    return <div className="muted">Could not load subject: {String(error)}</div>;

  return (
    <RoadmapView
      manifest={manifest}
      onRunStep={() => step.mutate()}
      running={step.isPending}
    />
  );
}
