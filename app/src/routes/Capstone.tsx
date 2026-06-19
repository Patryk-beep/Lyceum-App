import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { ArtifactView } from "../components/ArtifactView";
import { MasterySeal } from "../components/MasterySeal";
import { SubmissionEditor } from "../components/SubmissionEditor";
import { api } from "../lib/ipc";
import { useManifest } from "../lib/query";
import type { InputType } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

interface CapstoneBrief {
  prompt?: string;
  inputType?: InputType;
  options?: string[];
  language?: string;
}

export function Capstone() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const engineStart = useEngineStore((s) => s.start);
  const { data: manifest, isLoading } = useManifest(slug);

  // The capstone skill writes capstone.json (the deliverable spec) on its first
  // turn; the app writes the hand-in to submissions/capstone.md. Both reads 404
  // until they exist (retry:false so a 404 settles immediately).
  const brief = useQuery({
    queryKey: ["artifact", slug, "capstone.json"],
    queryFn: () => api.readArtifact(slug, "capstone.json"),
    enabled: !!slug,
    retry: false,
  });
  const deliverable = useQuery({
    queryKey: ["artifact", slug, "submissions/capstone.md"],
    queryFn: () => api.readArtifact(slug, "submissions/capstone.md"),
    enabled: !!slug,
    retry: false,
  });

  const run = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      qc.invalidateQueries({ queryKey: ["artifact", slug] });
    },
  });

  const submit = useMutation({
    mutationFn: (content: string) => api.submitCapstone(slug, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["artifact", slug] });
      run.mutate();
    },
  });

  if (isLoading || !manifest) return <div className="muted">Loading…</div>;

  const cert = manifest.certification as
    | { certified?: boolean; level?: number; deliverable?: string; notes?: string }
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

  let parsed: CapstoneBrief | null = null;
  if (brief.data) {
    try {
      parsed = JSON.parse(brief.data) as CapstoneBrief;
    } catch {
      parsed = null;
    }
  }

  // Phase A: no brief yet — design it (runs the capstone skill, which writes
  // capstone.md + capstone.json and stops to await the hand-in).
  if (!parsed) {
    return (
      <div className="capstone" data-testid="capstone-start">
        <h1>Capstone</h1>
        <p className="muted">
          An integrated project that demonstrates mastery across the whole subject.
          Designing the brief runs in the live console on the right; then you’ll hand
          in your deliverable here.
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

  const submitted = deliverable.isSuccess;
  const busy = submit.isPending || run.isPending;

  return (
    <div className="capstone" data-testid="capstone-brief">
      <h1>Capstone</h1>
      <ArtifactView slug={slug} relpath="capstone.md" title="Capstone brief" />
      {!submitted ? (
        <section className="submission-section" data-testid="capstone-submit">
          <h2 className="submission-section__title">Hand in your deliverable</h2>
          {parsed.prompt && <p className="muted">{parsed.prompt}</p>}
          <SubmissionEditor
            inputType={parsed.inputType}
            options={parsed.options}
            language={parsed.language}
            busy={busy}
            onSubmit={(content) => submit.mutate(content)}
          />
        </section>
      ) : (
        <section className="submission-section" data-testid="capstone-submitted">
          <h2 className="submission-section__title">
            Deliverable submitted — awaiting assessment
          </h2>
          <ArtifactView
            slug={slug}
            relpath="submissions/capstone.md"
            title="Your deliverable"
          />
          <button
            className="btn btn--primary"
            disabled={run.isPending}
            onClick={() => run.mutate()}
            style={{ marginTop: 12 }}
          >
            {run.isPending ? "Assessing…" : "Run assessment"}
          </button>
        </section>
      )}
    </div>
  );
}
