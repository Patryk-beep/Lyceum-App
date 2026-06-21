import { useRun } from "../stores/useEngineStore";

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  running: "Streaming…",
  done: "Done",
  error: "Error",
};

/** The LIVE SESSION surface for one subject: thinking, tool steps, streamed text. */
export function SessionConsole({ slug }: { slug: string | null | undefined }) {
  const { status, text, thinking, tools, warnings, init, result } = useRun(slug);

  return (
    <div className="session-console" data-testid="session-console">
      <div className={`session-console__status session-console__status--${status}`}>
        <span className="session-console__dot" />
        {STATUS_LABEL[status] ?? status}
      </div>

      {init && (
        <div className="session-console__init metric" data-testid="session-init">
          <span title="billing source">
            pool: {init.apiKeySource === "none" ? "Max" : init.apiKeySource}
          </span>
          <span>·</span>
          <span>mcp: {init.mcpServersEmpty ? "isolated" : "LEAK"}</span>
          <span>·</span>
          <span>skills: {init.lyceumSkills.length}</span>
        </div>
      )}

      {thinking && (
        <details className="session-console__thinking">
          <summary className="faint">Thinking</summary>
          <pre>{thinking}</pre>
        </details>
      )}

      {tools.length > 0 && (
        <ul className="session-console__tools">
          {tools.map((t) => (
            <li key={t.toolId} className={t.done ? "tool--done" : "tool--active"}>
              <span className="tool__name">{t.name}</span>
              <span className="tool__state">{t.done ? "✓" : "…"}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="session-console__text" data-testid="session-text">
        {text || (status === "idle" ? "No active session." : "")}
      </div>

      {result && !result.ok && (
        <div className="session-console__error">
          Turn ended with error (stop: {result.stopReason ?? "unknown"})
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="session-console__warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
