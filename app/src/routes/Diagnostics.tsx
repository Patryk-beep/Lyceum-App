import { useEffect, useState } from "react";

import { engineApi } from "../lib/engine";
import type { DoctorReport, PreflightReport } from "../lib/types";
import { useEngineStore } from "../stores/useEngineStore";

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="diag-check">
      <span className={ok ? "diag-check__ok" : "diag-check__bad"}>
        {ok ? "✓" : "✗"}
      </span>
      {label}
    </div>
  );
}

export function Diagnostics() {
  const [pre, setPre] = useState<PreflightReport | null>(null);
  const [doc, setDoc] = useState<DoctorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = useEngineStore((s) => s.start);

  useEffect(() => {
    engineApi.preflight().then(setPre).catch((e) => setErr(String(e)));
  }, []);

  async function runDoctor() {
    setBusy(true);
    setErr(null);
    try {
      setDoc(await engineApi.doctor());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSmoke() {
    setErr(null);
    start();
    setBusy(true);
    try {
      await engineApi.smoke(
        "In one short sentence, greet the learner as the Lyceum tutor. Do not use any tools.",
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="diagnostics">
      <h1>Diagnostics</h1>
      <p className="muted">
        The Claude bridge — binary resolution, plugin staging, isolation, and a live
        smoke turn.
      </p>

      <section className="card" style={{ padding: 18 }}>
        <div className="dashboard__section-title">Preflight</div>
        {pre ? (
          <>
            <Check ok={pre.claudeFound} label="claude binary found" />
            <Check ok={pre.pluginStaged} label="lyceum plugin staged" />
            <Check ok={pre.ready} label="bridge ready" />
            {pre.claudePath && (
              <div className="faint metric" style={{ marginTop: 6 }}>
                {pre.claudePath}
              </div>
            )}
            {pre.error && <div className="diag-error">{pre.error}</div>}
          </>
        ) : (
          <div className="muted">Checking…</div>
        )}
      </section>

      <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
        <button className="btn btn--outline" onClick={runDoctor} disabled={busy}>
          Run doctor
        </button>
        <button
          className="btn btn--primary"
          onClick={runSmoke}
          disabled={busy || !pre?.ready}
        >
          Run smoke turn
        </button>
      </div>

      {err && <div className="diag-error">{err}</div>}

      {doc && (
        <section className="card" style={{ padding: 18 }}>
          <div className="dashboard__section-title">Doctor</div>
          <Check ok={doc.ok} label="overall healthy" />
          <Check
            ok={doc.apiKeySource === "none"}
            label={`billing pool: ${doc.apiKeySource === "none" ? "Max subscription" : doc.apiKeySource}`}
          />
          <Check ok={doc.mcpServersEmpty} label="MCP isolated (no servers)" />
          <Check ok={doc.lyceumSkills.length === 9} label={`${doc.lyceumSkills.length}/9 lyceum skills loaded`} />
          <Check ok={doc.pluginOk} label="lyceum plugin recognized" />
          <Check ok={doc.resultOk} label="probe turn succeeded" />
          {doc.notes.length > 0 && (
            <ul className="diag-notes">
              {doc.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
