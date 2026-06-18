import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/ipc";
import { useEngineStore } from "../stores/useEngineStore";

const LEVELS = [
  { v: "1", label: "1 · Aware" },
  { v: "2", label: "2 · Functional" },
  { v: "3", label: "3 · Competent" },
  { v: "4", label: "4 · Proficient" },
  { v: "5", label: "5 · Expert" },
  { v: "6", label: "6 · Master" },
];

export function SubjectWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const engineStart = useEngineStore((s) => s.start);
  const [subject, setSubject] = useState("");
  const [start, setStart] = useState("test");
  const [target, setTarget] = useState("3");

  const create = useMutation({
    mutationFn: () => api.createSubject(subject.trim(), Number(target), start),
    onMutate: () => engineStart(),
    onSuccess: (slug) => {
      qc.invalidateQueries({ queryKey: ["subjects"] });
      navigate(`/subject/${slug}`);
    },
  });

  const canSubmit = subject.trim().length > 1 && !create.isPending;

  return (
    <div className="wizard" data-testid="subject-wizard">
      <h1>New subject</h1>
      <p className="muted">
        Lyceum researches the topic, places you, and builds a mastery curriculum.
      </p>

      <label className="wizard__field">
        <span>What do you want to learn?</span>
        <input
          className="wizard__input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Conversational Spanish"
        />
      </label>

      <div className="wizard__row">
        <label className="wizard__field">
          <span>Starting level</span>
          <select
            className="wizard__input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          >
            <option value="test">Run a placement test</option>
            {LEVELS.map((l) => (
              <option key={l.v} value={l.v}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="wizard__field">
          <span>Target level</span>
          <select
            className="wizard__input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {LEVELS.map((l) => (
              <option key={l.v} value={l.v}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="btn btn--primary"
        disabled={!canSubmit}
        onClick={() => create.mutate()}
        style={{ marginTop: 18 }}
      >
        {create.isPending ? "Setting up…" : "Create subject"}
      </button>

      {create.isError && (
        <div className="diag-error">{String(create.error)}</div>
      )}
    </div>
  );
}
