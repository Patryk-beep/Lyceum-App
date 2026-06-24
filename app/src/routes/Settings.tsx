import { useState } from "react";

import { useThemeStore, type ThemeName } from "../stores/useThemeStore";
import { checkForUpdate } from "../lib/updates";

const THEMES: { key: ThemeName; label: string; hint: string }[] = [
  { key: "bento", label: "Bento", hint: "warm putty, iris blocks, tile-first (default)" },
  { key: "bento-dark", label: "Bento Dark", hint: "the bento board after dusk" },
  { key: "playful", label: "Playful", hint: "warm cream, fresh green, gamified" },
  { key: "playful-dark", label: "Playful Dark", hint: "the study garden after dusk" },
  { key: "aurelia-dark", label: "Aurelia Dark", hint: "gilded indigo by candle-gold" },
  { key: "night", label: "Night", hint: "after dark by lamplight" },
  { key: "almanac", label: "Almanac", hint: "warm parchment, daylight" },
  { key: "momentum", label: "Momentum", hint: "cool, high-contrast" },
];

const RETENTION_KEY = "lyceum-retention";
const SESSION_KEY = "lyceum-session-min";

function loadNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return Number(v);
  } catch {
    /* ignore */
  }
  return fallback;
}

type UpdateUi =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; version: string; install: () => Promise<void> }
  | { kind: "installing" }
  | { kind: "installed" }
  | { kind: "error"; message: string };

export function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [retention, setRetention] = useState(() => loadNum(RETENTION_KEY, 90));
  const [session, setSession] = useState(() => loadNum(SESSION_KEY, 30));
  const [update, setUpdate] = useState<UpdateUi>({ kind: "idle" });

  function save(key: string, value: number) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  }

  async function onCheckUpdates() {
    setUpdate({ kind: "checking" });
    try {
      const res = await checkForUpdate();
      if (res.available && res.update) {
        const handle = res.update;
        setUpdate({
          kind: "available",
          version: res.version ?? "?",
          install: async () => {
            setUpdate({ kind: "installing" });
            try {
              await handle.downloadAndInstall();
              setUpdate({ kind: "installed" });
            } catch (e) {
              setUpdate({ kind: "error", message: e instanceof Error ? e.message : String(e) });
            }
          },
        });
      } else {
        setUpdate({ kind: "uptodate" });
      }
    } catch (e) {
      setUpdate({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="settings" data-testid="settings">
      <h1>Settings</h1>

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <div className="dashboard__section-title">Theme</div>
        <div className="settings__themes">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={
                "settings__theme" + (theme === t.key ? " is-active" : "")
              }
              onClick={() => setTheme(t.key)}
              data-testid={`theme-${t.key}`}
              aria-pressed={theme === t.key}
            >
              <span className="settings__theme-label">{t.label}</span>
              <span className="faint">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 14 }}>
        <div className="dashboard__section-title">Study defaults</div>
        <label className="wizard__field">
          <span>Session length (minutes)</span>
          <input
            className="wizard__input"
            type="number"
            min={5}
            max={180}
            value={session}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSession(v);
              save(SESSION_KEY, v);
            }}
          />
        </label>
        <label className="wizard__field">
          <span>Retention target (%)</span>
          <input
            className="wizard__input"
            type="number"
            min={70}
            max={98}
            value={retention}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRetention(v);
              save(RETENTION_KEY, v);
            }}
          />
        </label>
        <p className="faint" style={{ marginTop: 10, fontSize: 12.5 }}>
          New subjects use these defaults; the spaced-review schedule is the fixed
          Leitner ladder.
        </p>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 14 }} data-testid="updates">
        <div className="dashboard__section-title">Updates</div>
        <button
          className="btn btn--outline"
          onClick={onCheckUpdates}
          disabled={update.kind === "checking" || update.kind === "installing"}
          data-testid="check-updates"
        >
          {update.kind === "checking" ? "Checking…" : "Check for updates"}
        </button>
        <p className="faint" style={{ marginTop: 10, fontSize: 12.5 }}>
          {update.kind === "idle" && "Lyceum updates itself from signed GitHub releases."}
          {update.kind === "uptodate" && "You're on the latest version."}
          {update.kind === "available" && (
            <>
              Version {update.version} is available.{" "}
              <button className="btn btn--primary" onClick={update.install} data-testid="install-update">
                Install &amp; restart
              </button>
            </>
          )}
          {update.kind === "installing" && "Downloading and installing…"}
          {update.kind === "installed" && "Update installed — restart Lyceum to finish."}
          {update.kind === "error" && `Couldn't check for updates: ${update.message}`}
        </p>
      </section>
    </div>
  );
}
