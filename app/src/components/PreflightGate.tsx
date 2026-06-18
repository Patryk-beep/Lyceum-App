import { useQuery } from "@tanstack/react-query";

import { engineApi } from "../lib/engine";
import type { PreflightReport } from "../lib/types";

/** Blocks the app when the Claude bridge isn't ready (claude missing / not staged).
 * Claude is a hard dependency — there is no offline mode (locked decision #7). */
export function PreflightGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["preflight"],
    queryFn: engineApi.preflight,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="setup-screen" data-testid="preflight-loading">
        <div className="muted">Checking your environment…</div>
      </div>
    );
  }

  // If the command itself failed (not in Tauri) we let the app render rather than
  // hard-block — the gate only enforces a *resolved* not-ready state.
  if (error) return <>{children}</>;

  const report = data as PreflightReport;
  if (report && !report.ready) {
    return (
      <div className="setup-screen" data-testid="setup-screen">
        <div className="setup-screen__card card">
          <h1>Set up Claude Code</h1>
          <p className="muted">
            Lyceum drives your local <code>claude</code> to teach. It couldn’t start
            the bridge:
          </p>
          <div className="diag-error">{report.error ?? "claude not available"}</div>
          <ol className="setup-screen__steps">
            <li>
              Install Claude Code and sign in (<code>claude</code> on your PATH).
            </li>
            <li>Make sure you’re logged in to a plan that includes Claude Code.</li>
            <li>Re-launch Lyceum (the bridge is resolved at startup).</li>
          </ol>
          <button
            className="btn btn--outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Re-checking…" : "Re-check"}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
