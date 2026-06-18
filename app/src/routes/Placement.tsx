import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../lib/ipc";
import type { PlacementItem, PlacementState } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

export function Placement() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const engineStart = useEngineStore((s) => s.start);

  const pool = useQuery({
    queryKey: ["placementPool", slug],
    queryFn: () => api.placementPool(slug),
    retry: false,
    enabled: !!slug,
  });

  const [answers, setAnswers] = useState<boolean[]>([]);
  const [state, setState] = useState<PlacementState | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    api.placementStep(answers).then(setState);
  }, [answers]);

  const genTest = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(),
    onSuccess: () => pool.refetch(),
  });

  const finalize = useMutation({
    mutationFn: (level: number) =>
      api.placementFinalize(
        slug,
        level,
        `placed at L${level} after ${answers.length} item(s)`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      navigate(`/subject/${slug}`);
    },
  });

  if (pool.isLoading) return <div className="muted">Loading…</div>;

  if (pool.error || !pool.data) {
    return (
      <div className="placement" data-testid="placement-needs-pool">
        <h1>Placement test</h1>
        <p className="muted">
          Lyceum needs to generate a placement item pool first (runs the
          placement-test skill).
        </p>
        <button
          className="btn btn--primary"
          onClick={() => genTest.mutate()}
          disabled={genTest.isPending}
        >
          {genTest.isPending ? "Generating…" : "Generate placement test"}
        </button>
      </div>
    );
  }

  if (state?.done) {
    const level = state.recommendedLevel ?? 1;
    return (
      <div className="placement" data-testid="placement-result">
        <h1>Placement complete</h1>
        <p>
          Based on {answers.length} item(s), we recommend starting at{" "}
          <strong>Level {level}</strong>.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => finalize.mutate(level)}
          disabled={finalize.isPending}
        >
          {finalize.isPending ? "Applying…" : `Start at Level ${level}`}
        </button>
      </div>
    );
  }

  const tier = state?.nextTier ?? 1;
  const item: PlacementItem | undefined =
    pool.data.items.find((i) => i.tier === tier) ?? pool.data.items[0];

  if (!item) return <div className="muted">No placement items available.</div>;

  function answer(correct: boolean) {
    setRevealed(false);
    setAnswers((a) => [...a, correct]);
  }

  return (
    <div className="placement" data-testid="placement-item">
      <div className="dashboard__section-title">
        Placement · item {answers.length + 1} · tier {tier}
      </div>
      <div className="card review-card" style={{ borderLeftColor: "var(--stage-research)" }}>
        <div className="review-card__prompt">{item.stem}</div>
        {!revealed ? (
          <button className="btn btn--outline" onClick={() => setRevealed(true)}>
            Reveal scoring key
          </button>
        ) : (
          <>
            <div className="review-card__answer">{item.scoringKey || "(self-assess)"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--outline" onClick={() => answer(false)}>
                I got it wrong
              </button>
              <button className="btn btn--primary" onClick={() => answer(true)}>
                I got it right
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
