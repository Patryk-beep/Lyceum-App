import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { MasterySeal } from "../components/MasterySeal";
import { api } from "../lib/ipc";
import { useManifest } from "../lib/query";
import { useEngineStore } from "../stores/useEngineStore";

export function Capstone() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const engineStart = useEngineStore((s) => s.start);
  const { data: manifest, isLoading } = useManifest(slug);

  const run = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });

  if (isLoading || !manifest) return <div className="muted">Loading…</div>;

  const cert = manifest.certification as
    | { certified?: boolean; level?: number; date?: string; deliverable?: string; notes?: string }
    | null
    | undefined;

  if (cert && cert.certified) {
    return (
      <div className="capstone" data-testid="capstone-certified">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MasterySeal state="earned" />
          <h1 style={{ margin: 0 }}>Certified — Level {cert.level}</h1>
        </div>
        {cert.deliverable && (
          <p className="muted" style={{ marginTop: 12 }}>
            Deliverable: {cert.deliverable}
          </p>
        )}
        {cert.notes && <p>{cert.notes}</p>}
      </div>
    );
  }

  return (
    <div className="capstone" data-testid="capstone-start">
      <h1>Capstone</h1>
      <p className="muted">
        An integrated project that demonstrates mastery across the whole subject.
        The session runs in the live console on the right.
      </p>
      <button
        className="btn btn--primary"
        onClick={() => run.mutate()}
        disabled={run.isPending}
        style={{ marginTop: 12 }}
      >
        {run.isPending ? "Working…" : "Begin capstone"}
      </button>
    </div>
  );
}
