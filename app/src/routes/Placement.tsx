import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PlacementFeedback } from "../components/PlacementFeedback";
import { RichMarkdown } from "../components/RichMarkdown";
import { ZenEditor } from "../components/ZenEditor";
import { api } from "../lib/ipc";
import { parsePlacementState } from "../lib/placement";
import type { PlacementState } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

function verdictMark(v: string): string {
  return v === "correct" ? "✓" : v === "partial" ? "~" : "✗";
}

/**
 * Interactive placement. The placement-test skill writes `placement-state.json` (the
 * running test) each turn; the app hands the learner's typed answer in via
 * `placement-answer.json`, then runs the next engine step to grade it and ask again.
 * The streamed turn shows in the SkillRunOverlay (mounted by AppShell when this
 * subject is busy). When the skill sets `done`, the app commits the recommended level.
 */
export function Placement() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const engineStart = useEngineStore((s) => s.start);
  const engineReset = useEngineStore((s) => s.reset);

  // 404s until the first question is asked (retry:false settles immediately).
  const stateQ = useQuery({
    queryKey: ["artifact", slug, "placement-state.json"],
    queryFn: () => api.readArtifact(slug, "placement-state.json"),
    enabled: !!slug,
    retry: false,
  });

  // Run a placement turn (open the test, or grade-and-ask). We AWAIT the state refetch
  // in onSuccess so the mutation stays pending until the *new* question is on screen —
  // closing the window where the just-answered question would re-render with a live
  // Submit button. On error, clear the engine run so the (non-dismissible) overlay
  // can't strand the subject in a permanent "running" state.
  const run = useMutation({
    mutationFn: () => api.runSubjectStep(slug),
    onMutate: () => engineStart(slug),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      await qc.refetchQueries({ queryKey: ["artifact", slug, "placement-state.json"] });
    },
    onError: () => engineReset(slug),
  });

  // Hand in the typed answer, then immediately run the grade-and-ask turn.
  const submit = useMutation({
    mutationFn: (vars: { id: string; answer: string }) =>
      api.submitPlacementAnswer(slug, vars.id, vars.answer),
    onSuccess: () => run.mutate(),
  });

  // Commit the recommended level (placement{} block + scale.start + current.level).
  const finalize = useMutation({
    mutationFn: (vars: { level: number; evidence: string }) =>
      api.placementFinalize(slug, vars.level, vars.evidence),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manifest", slug] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      navigate(`/subject/${slug}`);
    },
  });

  // Clear a lingering FINISHED run from a previous step (the creation/research turn) so the
  // live console doesn't show stale research content on landing. A live turn is left alone;
  // the grade turn itself resets+streams via engineStart, so it shows placement, not research.
  useEffect(() => {
    const st = useEngineStore.getState().runs[slug]?.status;
    if (st === "done" || st === "error") engineReset(slug);
  }, [slug, engineReset]);

  const state: PlacementState | null = stateQ.data
    ? parsePlacementState(stateQ.data)
    : null;

  // Surface any mutation failure so a failed turn isn't indistinguishable from "not
  // started" (it would otherwise just reset the button). Cleared automatically on the
  // next mutate().
  const err = run.error ?? submit.error ?? finalize.error;
  const banner = err ? (
    <div className="card" role="alert" data-testid="placement-error" style={{ marginBottom: 12 }}>
      <span className="muted">Something went wrong:</span> {err.message}
    </div>
  ) : null;

  if (stateQ.isLoading) return <div className="muted">Loading…</div>;

  // No state yet (404 or unparseable) → begin the interactive placement.
  if (!state) {
    return (
      <div className="placement" data-testid="placement-begin">
        <h1>Placement test</h1>
        {banner}
        <p className="muted">
          A short, interactive check — Claude asks a question, you answer, and it adapts
          to find your level in a handful of questions. It runs in the live console on
          the right.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => run.mutate()}
          disabled={run.isPending}
          style={{ marginTop: 12 }}
        >
          {run.isPending ? "Starting…" : "Begin placement"}
        </button>
      </div>
    );
  }

  // Done → show the recommendation; the learner accepts it to start. Clamp the
  // LLM-authored level defensively (the backend also rejects out-of-range, but a sane
  // value here avoids a pointless round-trip).
  if (state.done) {
    const level = Math.min(6, Math.max(1, state.recommendedLevel ?? 1));
    const marks = state.history.map((h, i) => `Q${i + 1}(${verdictMark(h.verdict)})`).join(" ");
    const evidence = `${state.rationale ?? `placed at L${level}`}${marks ? " · " + marks : ""}`;
    return (
      <div className="placement" data-testid="placement-result">
        <h1>Placement complete</h1>
        {banner}
        {state.rationale && <p>{state.rationale}</p>}
        <p>
          We’d place you at <strong>Level {level}</strong> after {state.history.length}{" "}
          question{state.history.length === 1 ? "" : "s"}.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => finalize.mutate({ level, evidence })}
          disabled={finalize.isPending}
        >
          {finalize.isPending ? "Applying…" : `Start at Level ${level}`}
        </button>
      </div>
    );
  }

  // In progress with a current question → graded feedback on the last answer + the
  // answer box for the current one.
  if (state.current) {
    const q = state.current;
    const busy = submit.isPending || run.isPending;

    // Grading: an in-context "checking" card (the question + the answer just submitted) so the
    // transition is instant and self-explanatory — no heavy SkillRunOverlay for a Q&A (AppShell
    // suppresses it on the placement route). Phase 1 polish; the turn itself is still ~slow until
    // Phase 2 trims it.
    if (busy) {
      return (
        <div className="placement" data-testid="placement-checking">
          <div className="dashboard__section-title">
            Placement · question {state.asked} of up to {state.maxQuestions}
            {q.tier ? ` · tier ${q.tier}` : ""}
          </div>
          <div
            className="card review-card"
            style={{ borderLeftColor: "var(--stage-research)" }}
          >
            <div className="review-card__prompt"><RichMarkdown>{q.question}</RichMarkdown></div>
            {submit.variables?.answer && (
              <p className="muted placement-checking__answer">
                Your answer: {submit.variables.answer}
              </p>
            )}
            <div className="placement-checking__status muted">
              <span className="placement-checking__dot" />
              Checking your answer…
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="placement" data-testid="placement-question">
        <div className="dashboard__section-title">
          Placement · question {state.asked} of up to {state.maxQuestions}
          {q.tier ? ` · tier ${q.tier}` : ""}
        </div>
        {banner}
        {state.lastFeedback && (
          <PlacementFeedback
            verdict={state.history[state.history.length - 1]?.verdict}
            feedback={state.lastFeedback}
          />
        )}
        <div
          className="card review-card"
          style={{ borderLeftColor: "var(--stage-research)" }}
        >
          <div className="review-card__prompt"><RichMarkdown>{q.question}</RichMarkdown></div>
          {/* key=q.id remounts the editor (and its draft) per question so it clears. */}
          <ZenEditor
            key={q.id}
            inputType="text"
            busy={busy}
            submitLabel="Submit answer"
            brief={
              <>
                <div className="review-card__prompt"><RichMarkdown>{q.question}</RichMarkdown></div>
                {state.lastFeedback && (
                  <p className="muted">On your last answer: {state.lastFeedback}</p>
                )}
              </>
            }
            briefTitle={`Question ${state.asked}`}
            storageKey={`draft:${slug}:placement:${q.id}`}
            onSubmit={(answer) => submit.mutate({ id: q.id, answer })}
          />
        </div>
      </div>
    );
  }

  // Off-contract state: present, not done, but no current question. The skill only
  // nulls `current` together with `done:true`, so re-running would just hit WAIT and
  // change nothing. Treat it as inconsistent and offer an escape rather than a button
  // that burns a turn without progressing.
  return (
    <div className="placement" data-testid="placement-inconsistent">
      <h1>Placement test</h1>
      {banner}
      <p className="muted">
        This placement’s state looks out of sync (no current question, but not marked
        complete). You can head back to the subject and reopen placement from there.
      </p>
      <button
        className="btn btn--primary"
        onClick={() => navigate(`/subject/${slug}`)}
        style={{ marginTop: 12 }}
      >
        Back to subject
      </button>
    </div>
  );
}
