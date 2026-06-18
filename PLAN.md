# Lyceum-App — Master Implementation Plan

> **Status:** Implementation-ready. Synthesizes five subsystem designs + four red-team reviews into one coherent plan, resolving conflicts and folding in every verified fix. Decisions are locked; rationale is given in one line where designs disagreed.

---

## 1. Executive Summary

**What it is.** Lyceum-App is an OS-agnostic desktop GUI over the existing **Lyceum** learning system — a Claude Code plugin of nine coordinated skills that teach any subject beginner→mastery using evidence-based learning science. The app spawns the user's **local `claude` binary** as a long-lived `stream-json` child to do generative work (research, lessons, grading, capstone), while a **deterministic Rust engine** owns all mechanics (SRS, mastery gating, routing, ids, `progress.md`). App and Claude **share one `learning/<slug>/manifest.json`** per subject on disk — files are the contract, never chat text.

**The locked architecture in 5 bullets:**

1. **Engine = raw `stream-json` subprocess.** One long-lived `claude -p --output-format stream-json --input-format stream-json --verbose --include-partial-messages --replay-user-messages --dangerously-skip-permissions --permission-mode bypassPermissions` child **per subject slug**, driven over stdin/stdout, resumed via `--resume <session_id>`. Auth = user's **Max subscription OAuth** (env scrubbed so no API key leaks).
2. **Shell = Tauri v2.** Rust core (spawns claude, owns fs + deterministic engine, exposes commands, emits typed events) + React+Vite+TypeScript webview. Cross-platform (mac/win/linux).
3. **Logic split = Hybrid.** Deterministic mechanics in Rust (`lyceum-core`); generative work delegated to Claude running the skills. **Single-writer-for-mastery**: only `assess-understanding`/`review-session`/`capstone` (Claude) write `objective.mastery`, flip modules to `mastered`, or certify.
4. **Skill loading = `--plugin-dir <staged plugin>`** (DECIDED — verified: sets `${CLAUDE_PLUGIN_ROOT}` so `references/*.md` resolve; `--add-dir` does not and is rejected).
5. **Concurrency = honest last-writer-wins** (MANIFEST.md §103: *"one active session per subject, last-writer-wins; don't edit two copies at once"*). The app NEVER writes `manifest.json` while a Claude turn for that slug is in flight; it re-reads after every turn. This is the load-bearing correction to the over-sold "impossible by construction" claim.

---

## 2. System Architecture (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TAURI DESKTOP APP (one window)                      │
│                                                                            │
│  ┌────────────────────────┐         ┌──────────────────────────────────┐  │
│  │   WEBVIEW (React/TS)    │ invoke  │      RUST CORE (src-tauri)        │  │
│  │                        │────────▶│                                  │  │
│  │  • TanStack Query      │ events  │  ┌────────────────────────────┐  │  │
│  │    (manifest = truth)  │◀────────│  │ lyceum-core (PURE, no I/O)  │  │  │
│  │  • Zustand             │         │  │  manifest·srs·mastery·     │  │  │
│  │    (live stream only)  │         │  │  routing·ids·progress·     │  │  │
│  │  • Screens + LIVE      │         │  │  store(atomic)·concurrency │  │  │
│  │    SESSION console     │         │  └────────────────────────────┘  │  │
│  └────────────────────────┘         │  ┌────────────────────────────┐  │  │
│        ▲                            │  │ engine/ (claude bridge)     │  │  │
│        │ claude://<slug> events     │  │  spawn·protocol·session·   │  │  │
│        │ manifest:changed           │  │  lifecycle·SessionManager  │  │  │
│        └────────────────────────────│  └─────────────┬──────────────┘  │  │
│                                     └────────────────│─────────────────┘  │
└──────────────────────────────────────────────────────│────────────────────┘
                                                        │ stdin: {"type":"user",…}\n
                                       stdout: NDJSON ▲ │ ▼
                          ┌─────────────────────────────────────────────┐
                          │   claude -p --output-format stream-json     │
                          │   (per-subject child; --resume <id>)        │
                          │   cwd = <canonical workspace root>          │
                          │   --plugin-dir <staged lyceum plugin>       │
                          │   ENV SCRUBBED (no ANTHROPIC_API_KEY)       │
                          │   running lyceum:learn, :research-topic, …  │
                          └─────────────────────┬───────────────────────┘
                                                │ read/Write/Edit tools
                                                ▼
        ┌───────────────────────────────────────────────────────────────┐
        │  SHARED DISK  <appData>/workspace/                             │
        │    learning/<slug>/manifest.json   ◀── app reads, both write   │
        │      research.md · knowledge-map.json · curriculum.{md,json}   │
        │      placement.md · lessons/NN-*.md · assignments/NN-*.md      │
        │      quizzes/<mod>-<ts>.json · placement-items.json            │
        │      reviews.md · progress.md · capstone.md                    │
        │      .session (app-local: session_id + claude_version)         │
        │    .lyceum/plugins/lyceum/  (staged plugin; CLAUDE_PLUGIN_ROOT)│
        └───────────────────────────────────────────────────────────────┘
```

**Two contracts (non-negotiable):**
1. **State-not-conversation:** every step reads `manifest.json`, acts, writes it back (bump `updated`); routing computed from disk.
2. **Single-writer-for-mastery:** only `assess-understanding` and `review-session` write `objective.mastery` / flip a module to `mastered`; only `capstone` writes `certification`/`certified`. Enforced in Rust by a capability token the app code can never construct.

---

## 3. Repo & Directory Layout (`/Users/patryk/repos/Lyceum-App`)

**Landing-page relocation: `index.html` → `/site/`.** The prompt asks for `/site`. Legacy GitHub Pages serves only `/` or `/docs`, so a `/site` move requires switching Pages to an Actions workflow — we ship `.github/workflows/pages.yml` (`actions/deploy-pages`) alongside the move. Carry `.nojekyll` into `/site/`. *(Rationale: prompt explicitly says `/site`; the one-step `/docs` alternative is noted in Open Questions if the user prefers zero Pages reconfig.)*

```
Lyceum-App/
├─ site/                          # ← landing page moves here (index.html, .nojekyll, README assets)
├─ app/                           # the desktop app
│  ├─ Cargo.toml                  # [workspace] root (Rust)
│  ├─ rust-toolchain.toml         # pin stable
│  ├─ package.json                # pnpm; drives Vite + tauri
│  ├─ pnpm-workspace.yaml · vite.config.ts · tsconfig.json
│  ├─ index.html                  # Vite entry (webview doc, NOT landing page)
│  ├─ crates/
│  │  ├─ lyceum-core/             # PURE deterministic engine — no Tauri, no tokio
│  │  │  └─ src/ lib.rs model.rs store.rs srs.rs mastery.rs routing.rs
│  │  │         ids.rs progress.rs concurrency.rs date.rs error.rs
│  │  │  └─ bindings/             # ts-rs OUTPUT (gitignored, regenerated)
│  │  │  └─ tests/                # unit + golden-file (headless, no claude)
│  │  └─ lyceum-engine/           # claude subprocess driver (separable, async)
│  │     └─ src/ lib.rs spawn.rs protocol.rs parser.rs session.rs
│  │            lifecycle.rs events.rs session_manager.rs workspace.rs
│  ├─ src-tauri/                  # thin Tauri shell (no business logic)
│  │  ├─ Cargo.toml · tauri.conf.json · build.rs
│  │  ├─ capabilities/default.json
│  │  ├─ resources/lyceum/        # vendored plugin (bundle.resources) — the plugin source of truth
│  │  └─ src/ main.rs state.rs emit.rs commands/{mod,workspace,manifest,engine,srs,system}.rs
│  └─ src/                        # React webview
│     ├─ main.tsx App.tsx
│     ├─ routes/ (or screens/)    # one folder per screen
│     ├─ components/              # MasteryMeter/Ring/Seal, StageChip, SessionConsole…
│     ├─ stores/                  # Zustand: useEngineStore (stream-only)
│     ├─ lib/ ipc.ts events.ts query.ts manifest.ts routing.ts
│     ├─ bindings/                # copy of lyceum-core/bindings (generated types)
│     └─ theme/ tokens.night.css tokens.almanac.css tokens.momentum.css
│            primitives.css stages.ts ThemeProvider.tsx
├─ tests/ fixtures/streams/*.jsonl  fixtures/manifests/*.json
├─ scripts/ record-stream.mjs  check-schema-parity.mjs
└─ .github/workflows/ pages.yml  app-ci.yml
```

**Two Rust crates, not one.** `lyceum-core` must compile & test **without** Tauri/tokio/windowing (CI runs `cargo test -p lyceum-core` headless). `lyceum-engine` owns the OS subprocess + async I/O. `src-tauri` is a thin shell. This enforces single-writer at the type level: mastery-bearing mutations live only in `lyceum-core` behind a capability token.

**Plugin lives where:** vendored frozen into `src-tauri/resources/lyceum/` (a copy of `/Users/patryk/Lyceum-app/plugins/lyceum`), bundled as a Tauri resource, **staged** to `<appData>/workspace/.lyceum/plugins/lyceum` on first run / version bump. *(Rationale: vendoring decouples app releases from the user's plugin edits and is signable; staging avoids macOS read-only-bundle/quarantine issues.)*

**Type sharing = `ts-rs`** (Rust is source of truth; only Rust+TS consume the schema; no third language needs JSON Schema). `pnpm gen:types` runs ts-rs export tests → `bindings/` → copied to `src/bindings/`; a CI step regenerates and `git diff --exit-code` to catch drift.

---

## 4. The Claude Streaming Bridge (`lyceum-engine`)

### 4.1 Spawn (`spawn.rs`)

```
claude -p
  --output-format stream-json  --input-format stream-json  --verbose
  --include-partial-messages          # VERIFIED: required for text/tool deltas
  --replay-user-messages              # VERIFIED: echoes our msg for turn correlation
  --dangerously-skip-permissions  --permission-mode bypassPermissions
  --plugin-dir <staged lyceum>        # sets CLAUDE_PLUGIN_ROOT (the chosen mechanism)
  --setting-sources project           # NOT project,user (see isolation fix)
  [--add-dir <workspace_root>]        # only if cwd != workspace; cwd IS workspace, so omit
  [--resume <session_id>]  [--model <pinned>]
  cwd = <CANONICAL workspace_root>    # realpath'd once, frozen
```

**Env scrub (MANDATORY — billing correctness):**
```rust
c.env_remove("ANTHROPIC_API_KEY");      c.env_remove("ANTHROPIC_AUTH_TOKEN");
c.env_remove("ANTHROPIC_BASE_URL");     c.env_remove("CLAUDE_CODE_USE_BEDROCK");
c.env_remove("CLAUDE_CODE_USE_VERTEX"); // never pass --bare (forces API key)
```
Runtime guard: parse `apiKeySource` from `system/init`. VERIFIED `"none"` under OAuth. If it ever surfaces as `"ANTHROPIC_API_KEY"`/`"apiKeyHelper"` → emit `AuthWarning` and warn "billing per-token, not your Max plan."

**RED-TEAM FIX — MCP isolation (verified `--setting-sources project` is NOT hermetic; 5 user MCP servers + global hooks/skills bled in).** Spawn the child with an explicit private config dir so the user's `~/.claude` hooks/plugins/MCP are invisible:
- Set `CLAUDE_CONFIG_DIR` (and/or `HOME`/`XDG_CONFIG_HOME`) to a Lyceum-private dir for the child.
- Use `--setting-sources project` only (drop `user`).
- If supported on v2.1.181: `--strict-mcp-config` with an empty `--mcp-config` (verify before shipping).
- **`claude_doctor` asserts `init.mcp_servers == []` and `init.skills`/`plugins` contain ONLY lyceum; refuse to proceed otherwise.** This also cuts cost/TTFT and removes the hook-injection attack surface.

**RED-TEAM FIX — binary resolution (macOS GUI gets stripped PATH; `~/.local/bin/claude` is a version-symlink).** Order: (1) explicit Settings override; (2) **timeout-guarded, non-interactive** login-shell probe `$SHELL -lc 'command -v claude'` (never `-lic` — can hang on interactive rc); (3) common paths `~/.local/bin`, `~/.claude/local/claude`, `/opt/homebrew/bin`, `/usr/local/bin`, Windows `%LOCALAPPDATA%`. **Cache the SYMLINK path (`~/.local/bin/claude`), not its resolved versioned target**, so a self-update doesn't pin a deleted dir. If none → `Fatal{ClaudeNotFound}` + install/locate UI.

**RED-TEAM FIX — plugin staging race.** Acquire a stage lockfile in appData; stage to a temp dir; **validate the tree** (assert all 9 `SKILL.md` + `.claude-plugin/plugin.json` + `references/{MANIFEST,REFERENCE,LEVELS}.md` exist & non-empty); atomic-rename into place; only then write `.staged-version`. `doctor` re-validates on every launch.

### 4.2 Session, continuity, resume

- **One `ClaudeSession` per subject slug** (`SessionManager: DashMap<String, Arc<ClaudeSession>>`). `--resume` is bound to a single conversation thread + cwd; per-subject keeps context scoped and prevents thread bleed. Idle sessions reaped after N min (keep ≤2 warm; resume on demand).
- `session_id` captured from `system/init`, persisted to `learning/<slug>/.session` (`{session_id, claude_version, updated}`) — **kept out of `manifest.json`** (infra state, not pedagogical contract).
- **RED-TEAM FIX — canonicalize cwd once.** `realpath()` the workspace root at provisioning and freeze it (macOS `/tmp`→`/private/tmp` symlink canonicalization invalidates resume otherwise). Store `claude_version` in `.session`; on version mismatch, fast-path to a fresh session.

### 4.3 Turn protocol

1. Require `state == Idle` (reject concurrent turns with `Busy`; UI disables composer while `InTurn`). One in-flight turn per session.
2. `turn_id = next_turn.fetch_add(1)`; write `{"type":"user","message":{"role":"user","content":"<instruction>"}}\n`, flush; `state=InTurn`; emit `TurnStarted`.
3. Stream events → `BridgeEvent` projection → emit on `claude://<slug>`.
4. **Turn ends iff a `result` line is read** (or process exits). Emit `TurnResult`; `state=Idle`; capture/confirm `session_id`.

### 4.4 Cancellation (kill + resume — no in-band interrupt exists)

`cancel_turn`: SIGINT child → wait ≤2 s → SIGKILL → emit `TurnCancelled` → respawn with `--resume`. State returns to `Idle`. Half-written artifacts are regenerable; the deterministic core re-derives routing from disk; steps are idempotent. **Manifest writes use temp-file + atomic rename** so a kill never leaves a torn manifest.

### 4.5 Recovery & supervision (with all four red-team fixes)

| Condition | Classification | Action |
|---|---|---|
| Child exits, `InTurn`, no `result` | `ChildDied` | Auto-restart `--resume`, backoff 0.5/2/8 s, max 3 in 60 s → circuit-break `Fatal{ProtocolBroken}` |
| **`result` with `subtype` `error_*`/`is_error:true` AND no preceding `init`** (verified: bad `--resume` exits 0) | **`ResumeFailed`** | **Drop `--resume`, delete stale `.session`, spawn fresh, `Warning{started fresh session}`. NOT crash backoff.** Parse `errors[]` for "No conversation found". |
| `rate_limit_info` `overageStatus:"rejected"` / `out_of_credits`, or `result.api_error_status` quota | **`Quota`** | **SUPPRESS auto-restart (no restart storm against empty wallet). Banner "Max pool exhausted, resets at <resetsAt>" + retry-after timer.** |
| **No stdout bytes for 120 s** (reset on every line) | **Watchdog** | **Force `TurnResult{ok:false, stop_reason:"watchdog"}` + kill + resume.** Wall-clock cap 20 min as backstop only — distinguishes "slow but streaming" (long research) from "truly hung". |

### 4.6 Parser & backpressure (`parser.rs`)

- `BufReader::read_line`; cap a line at 8 MiB; on overflow `Warning` + resync to next `\n`.
- **Unknown `type`/subtype/`event.type` → `RawEvent::Unknown(Value)`, logged debug, NEVER fatal** (wire is unversioned). Tolerant serde with `#[serde(other)]`.
- Per-line parse error → `Warning{skipped unparsable line}`, continue (never panic the reader).
- **Coalesce** `TextDelta`/`ThinkingDelta` at ≤16 ms (≈60 fps) or on any non-text boundary. **RED-TEAM FIX — never coalesce/drop tool-arg frames:** `input_json_delta` fragments accumulate per-block and are exempt from the drop-under-saturation rule. On parse failure at `content_block_stop`, **fall back to the assembled `args` from the subsequent `type:"assistant"` full message** before emitting `args:null`.
- **RED-TEAM FIX — replay vs tool_result discrimination is STRUCTURAL only:** a `type:"user"` message is a tool_result **iff any block has `type=="tool_result"`**; otherwise it's the `--replay-user-messages` echo. Never use text matching or arrival order.
- stderr drained to its own task into a ring buffer; attach last ~4 KB to `Fatal`. *(Note: long noisy MCP/node stderr can wrap the ring — isolation fix removes most of it.)*

### 4.7 Event union (`events.rs`) — emitted on `claude://<slug>`

```rust
#[serde(tag="kind", content="data", rename_all="camelCase")]
pub enum BridgeEvent {
  SessionInit { session_id, model, api_key_source, mcp_servers_empty: bool,
                skills_loaded: usize, plugin_ok: bool },
  AuthWarning { source },
  TurnStarted { turn_id },
  TextDelta { turn_id, block, text },   ThinkingDelta { turn_id, block, text },
  ToolUseStart { turn_id, block, tool_id, name },
  ToolUseArgs  { turn_id, block, tool_id, partial_json },
  ToolUseEnd   { turn_id, block, tool_id, args },      // assembled, or assistant-fallback
  ToolResult   { turn_id, tool_id, is_error, preview }, // first 2 KB
  NeedsInput   { turn_id, question },   // AskUserQuestion intercepted (see §6)
  TurnResult   { turn_id, ok, stop_reason, text, usage, num_turns,
                 cost_usd_list_price: f64 },  // NOTE: list-price only, never "you were charged"
  TurnCancelled { turn_id },
  RateLimit { status, resets_at, kind },
  Warning { message },
  Fatal { kind: FatalKind, message },   // ClaudeNotFound|NotLoggedIn|SpawnFailed
                                        // |ChildDied|ResumeFailed|Quota|ProtocolBroken
}
```

**RED-TEAM FIX — cost display.** `total_cost_usd` is a **notional list-price** number even under Max OAuth (verified: a one-word PONG reported $0.0416). **Never surface it as a dollar charge.** When `apiKeySource=="none"` (Max pool), render usage as **tokens + remaining quota** (from `rate_limit_info`); hide $ or label it "est. list price". Show real $ only if `apiKeySource` indicates a pay-as-you-go API key. Keep `cost_usd` in telemetry only.

### 4.8 Startup self-test (`claude_doctor`, throwaway cwd)

Resolve binary → stage+validate plugin → fire a probe turn ("reply PONG, no tools") and assert: `init` seen; `apiKeySource=="none"`; **`mcp_servers==[]`**; `plugins` contains `lyceum` with all 9 skills; staged-tree validation passed; `result.is_error==false`; **resume of a throwaway session round-trips `session_id`**. Surface pass/fail in Settings → Diagnostics.

---

## 5. The Deterministic Engine (`lyceum-core`) + Concurrency Protocol

### 5.1 Manifest model (`model.rs`)

Serde types mirror MANIFEST.md 1:1. ISO dates via a `date::iso` with-module on `time::Date` (no chrono tz traps). Forward-compat: `#[serde(flatten)] extra: Map<String,Value>` on growth-prone structs. **RED-TEAM FIX — validate untagged enums loudly, never silently bucket into `extra`:**

```rust
pub enum ScaleStart { Level(u8 /*1..=6*/), Test }   // serde untagged: int | "test"; reject out-of-range
pub enum Box_       { N(u8 /*1..=6*/), Retired }    // reject 0 and 7 as CoreError::Invalid
pub enum ModuleStatus { Locked, Available, InProgress, Mastered }
pub enum Phase { Teach, Assign, Assess, Remediate, Capstone }
```
Newtypes `ModuleId/ObjectiveId/AssignmentId/ReviewId` own numeric-suffix parse/format.

### 5.2 SRS scheduler (`srs.rs`) — the canonical Leitner ladder

**CONFLICT RESOLVED: ship `[1,3,7,16,35,90]` days (REFERENCE.md §31), NOT the deck's `<1m/2d/4d/9d`.** *(One line: the deck numbers are cosmetic UI labels; the skill specs are authoritative and Claude writes to them — diverging would make every app↔Claude review write fight.)*

| Box | Interval | Box | Interval |
|---|---|---|---|
| 1 | 1 d | 4 | 16 d |
| 2 | 3 d | 5 | 35 d |
| 3 | 7 d | 6 | 90 d → `retired` on next pass |

- **Binary pass/fail.** `Grade ∈ {Again,Hard,Good,Easy}`; `Again`=fail, `Hard/Good/Easy`=pass = **single-box promotion** (no 2-box jumps). Documented loudly so UI doesn't imply Easy jumps two boxes.
- Pass: `N(b)→N(min(b+1,6))`, `due=today+interval`; from box 6 → `Retired`. Fail: `N(1)`, `due=today+1`, `lapses+=1`, `last_result=Fail`.
- `human_interval_label(box)` is a **display-only** helper; it never feeds the schedule.
- `due_items`, `select_batch` (clamp [8,15], most-overdue-first, no topic sort), `interleave` (greedy round-robin so consecutive items rarely share `module_id`). *(Actual quizzing/interleaving is Claude's job; app uses these only for the "N due" badge and candidate set.)*

### 5.3 Mastery gating (`mastery.rs`)

`default_threshold`: L1/L2→0.90, L3→0.85, L4–6→0.85 (rubric-referenced). `band_to_mastery`: Proficient≈0.85, Advanced≈1.0, <Prof<0.70. `module_clears_gate`: all objectives ≥ threshold. **RED-TEAM FIX:** `availability` (locked→available) is a **READ-ONLY projection the app computes for display**. *(One line: `module.status` is double-written — `assess-understanding` flips it to `mastered` AND would race an app `locked→available` write; make Claude the sole `module.status` writer.)*

### 5.4 Routing (`routing.rs`) — the learn router, deterministic mirror

First-match-wins (i)→(ix), from disk only (stat files; never parse prose):
(i) no `research.md` → Research; (ii) `!placement.taken && scale.start==Test` → Placement; (iii) no `curriculum.json` → BuildCurriculum; (iv) current module `!taught` → Teach; (v) taught & no open/submitted assignment **for current module** → CreateAssignment; (vi) current module has `open` assignment → CompleteOpenAssignment; (vii) **the current module's** `submitted` assignment (or lowest-id submitted) → Assess; (viii) all modules through target `mastered` → Capstone; (ix) `current.status==Certified` → CourseComplete. `Remediate` phase re-enters Teach/CreateAssignment. `reviews_due` surfaced orthogonally.

**RED-TEAM FIX — scope branch (vii) to current module**, not "any submitted" (a stale `submitted` on an old module must not hijack routing). Add a routing test fixture for this.

`deriveRoute` is mirrored in TS for the Resume/Today UI but treated as **advisory only** — the authoritative mutation always goes through the engine/Claude.

### 5.5 Id allocation (`ids.rs`)

Max-suffix+1, never reuse. Widths: modules/assignments 2, reviews 3, objectives unpadded. Empty → `m01`/`a01`/`r001`/`<mid>-o1`. App legitimately allocates only `reviewQueue` ids (schedule-only writes); the rest are Claude's in practice, helper shared for parity tests.

### 5.6 Store (`store.rs`) — atomic, canonical, transient-corrupt-aware

- `load`: `from_slice`; **RED-TEAM FIX — distinguish transient vs real corrupt:** on parse failure from the **watcher path**, retry-with-backoff (3× over ~500 ms) before surfacing; only an explicit user-initiated load treats first corrupt as terminal (`CoreError::Corrupt{transient:bool}`).
- `save` (only deterministic writer path): optimistic fingerprint check → bump `updated` → serialize pretty preserve-order → write `.tmp` → fsync → rename over → fsync dir → write rolling `.bak`. **Windows:** `ReplaceFileW`/`MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, retry-on-sharing-violation, dir-fsync no-op-tolerant, guarantee no surviving `.tmp` on failure.
- **RED-TEAM FIX — fingerprint over a CANONICAL form** (sorted keys, normalized numbers `0.9==0.90`, stripped whitespace) THEN sha256, because Claude's Edit tool reorders keys/reformats numbers and naive byte-fingerprinting would flag spurious conflicts every turn. mtime/size only as a cheap watcher pre-filter.

### 5.7 Concurrency — the honest protocol

**REFRAMED PER RED-TEAM (critical):** MANIFEST.md §103 is **last-writer-wins, one session per subject**. The skills do plain read-modify-write via Claude's file tools — they will **never** read a lockfile or honor a fingerprint. So the protocol is **app-side hygiene over a last-writer-wins file, not mutual exclusion**. The rule that makes it safe:

> **The app MUST NOT write `manifest.json` while a Claude turn for that slug is dispatchable or in flight.** All writes serialize through a single per-slug app mutex. After every turn the app **re-reads from disk** (never caches across a turn boundary) before computing routing.

#### Ownership Table (authoritative — single-writer-for-mastery)

| Field / mutation | App writes (deterministic) | Claude turn only | Source |
|---|---|---|---|
| `objective.mastery`, `attempts`, `lastAssessed` (raise) | **No** | **Yes** (assess/review) | MANIFEST §13 |
| `module.status → mastered` | **No** | **Yes** (assess) | contract (2) |
| `module.status: locked→available` | **No (read-only projection)** | **Yes** (assess unlocks dependents) | red-team fix |
| `current.status ∈ {capstone, certified}` | **No** | **Yes** (assess/capstone) | MANIFEST §15 |
| `certification` | **No** | **Yes** (capstone) | generative |
| `reviewQueue[].box/due/lastResult/lapses` (SRS) | **Yes** (`apply_grade`, schedule-only) | or Claude if review run as a turn | review-session §6 |
| `objective.mastery` lapse penalty | **No** (route to a turn) | **Yes** | red-team fix |
| `current.{level,moduleId,phase}` navigation | **Yes** only for app-initiated moves (Resume→open lesson) | Claude when assess advances | MANIFEST §15 |
| new `reviewQueue` ids | **Yes** | or Claude | MANIFEST §101 |
| `modules[]`/`objectives[]`/`assignments[]`/`placement`/`scale` content, all `.md`/`.json` | **No** | **Yes** | generative |
| `updated`, `history` append | **Yes** (every app write) | Claude also | both contracts |
| `settings` | **Yes** (Settings UI) | — | app-owned |

**RED-TEAM FIX — lapse penalty.** *(One line: the original design both forbade and permitted app mastery writes.)* **Decision: pure-app review is schedule-only** (`box/due/lapses/lastResult`) and NEVER touches `objective.mastery`. Mastery penalties on review fails are applied by the next assess turn or a review-as-turn. This keeps the "no app-callable mastery setter" claim true.

**Enforcement (structural, compile-fenced):** mastery-raising / module-mastered / certification mutations require a `MasteryWriter` token that `lyceum-core` **never constructs for app code** (only an internal test/sim path). App writes take an `AppWriter`. A `trybuild` test asserts no `app_*` API can set mastery.

**RED-TEAM FIX — turn classification by what Claude ACTUALLY wrote, not by routing prediction.** Until skills self-report writes, default to **ALWAYS-RELOAD-NEVER-WRITE-NAV** for any turn that could touch `current{}` (teach, assess, curriculum, capstone) — the app never pre-writes nav for those steps; it adopts the reloaded result.

**RED-TEAM FIX — reload validator (the real defense if skills load wrong).** On the first reload after any turn, run a **schema + transition validator** that REJECTS impossible states Claude could have written: box ∉ 1..6|retired; module `mastered` with an objective below threshold; `certified` without `certification`; module `available` with an unmastered prereq; ids not max+1; mastery raised by a non-assess/review turn. On violation → HALT and tell the user "the headless session may not have loaded the lyceum skills" rather than propagating corruption.

**RED-TEAM FIX — heartbeat lock, not PID.** The advisory `.manifest.lock` carries a **heartbeat mtime** the turn owner touches every N s while a turn is genuinely active. Staleness = heartbeat older than 2–3N (PID-based detection never fires because the claude child lives across turns). Long research turns stay fresh; crashes stop the heartbeat. The fingerprint check remains a backstop, documented as **detection, not prevention**.

**RED-TEAM FIX — shared "today" contract.** App stamps its civil-date offset into `manifest.settings` (and the dispatched turn); the workspace skill config instructs skills to compute "today" the same way, avoiding midnight-boundary due-batch disagreement. Add a `date_tests` midnight case.

### 5.8 progress.md (`progress.rs`)

Renders the exact MANIFEST.md §113 shape; mastery column = mean objective mastery (`—` if unassessed, never invented); Next-action = `routing.why`. `insta` snapshot-tested.

---

## 6. Generative Delegation (UI action → skill → artifact)

**Principle: artifacts, not chat.** Skills already persist `manifest.json` + typed side files; the app re-reads those as the structured result. The 6-step cycle per generative action: **snapshot → build prompt (names `lyceum:<skill>`, pins `<slug>`, restates the file contract, ends with `<<LYCEUM_DONE>>`) → run turn → re-read artifacts → verify post-conditions → recompute route & emit.**

### 6.1 Action → skill → artifact table

| UI action | Kind | Skill | Skill writes | App reads back |
|---|---|---|---|---|
| New subject (subject/target/start) | **G** | `learn` (+`research-topic`) | manifest, `history`, `progress.md`; then `research.md`, `knowledge-map.json` | `Manifest`, `KnowledgeMap` |
| Research | G | `research-topic` | `research.md`, `knowledge-map.json` (5 keys) | `KnowledgeMap` |
| Placement | **G (app-driven loop)** | `placement-test` | `placement-items.json` (item pool), then `placement{}`+`placement.md` | items + `placement` |
| Build curriculum | G | `build-curriculum` | `curriculum.{md,json}`, `modules[]`, `current.*` | `Curriculum`, `modules` |
| Teach / Resume | G | `teach-lesson` | `lessons/NN-*.md`, `reviewQueue` seeds (Box1 due+1), `taught=true`, `current.phase`; **`quizzes/<mod>-<ts>.json`** | `Manifest`, lesson md, quiz json |
| Open saved lesson | **D** | — | — | `lessons/NN-*.md` from disk |
| Create assignment | G | `create-assignment` | `assignments/NN-*.md`, `assignments[]`(open) | `assignments`, md |
| Submit → grade | G | `assess-understanding` | assignment→graded, mastery, `module.status`, `current`, reviews, `calibration` | full `Manifest` diff |
| Generate quiz | G | `teach-lesson`/`assess` | `quizzes/*.json` | `QuizSet` |
| Answer MCQ | **D** | — | local grade over quiz json; review-lane SRS only | mutated `Manifest` |
| Review: show/reveal | **D** | — | — | `reviewQueue` from disk |
| Review: Again/Hard/Good/Easy | **D** | — | `reviewQueue` (schedule-only, `leitner.rs`) | mutated `Manifest` |
| Capstone | **G (conversational sub-mode)** | `capstone` | `capstone.md`; on pass `certification`+`certified` | `certification` |
| Analytics / Settings | **D** | — | (settings) | manifest+`progress.md` |

**Rule:** action is **D** iff its result is a function of existing disk state (scheduling, gating, routing, opening files, grading a pre-generated MCQ, analytics); **G** iff it needs new generation/judgment.

### 6.2 RED-TEAM FIXES (these block v1 if not folded in)

- **Patch the skills, don't inject undocumented instructions.** `quizzes/*.json` is written by **no** skill today. Add an explicit "machine output" section to **vendored forks** of `teach-lesson`/`assess-understanding` (mandate `quizzes/<mod>-<ts>.json` with `{items:[{id,stem,choices,correct,rationale,objectiveIds}]}`) and to `placement-test` (mandate `placement-items.json`). Ship these in `resources/lyceum/` — the workspace plugin, NOT the user's global plugin. The app's prompt then **restates a contract the skill owns**.
- **Multi-turn skills don't fit one-shot delegation.** `placement-test` and `capstone` (and `learn`'s 3-question setup) are interactive. **Decisions:**
  - **Placement:** skill writes the full item pool to `placement-items.json` (tier + scoring key); the **app drives the adaptive loop locally in Rust** per PLACEMENT.md (fully deterministic floor/ceiling logic); **one final delegation** asks the skill to write `placement{}`+`placement.md` from the app-collected transcript.
  - **Capstone & learn-setup:** use a **conversational sub-mode** where the LIVE SESSION console IS the chat — the app relays stdin/stdout and feeds answers on the next stdin line, dropping the artifact-only contract for these flows. `learn` setup answers (subject/target/start) are fed as the FIRST user message so `learn` never needs `AskUserQuestion`.
- **Disarm/intercept `AskUserQuestion`.** Exclude via `--disallowed-tools` if supported; else detect any `AskUserQuestion` tool_use as a `NeedsInput` signal that **pauses the turn (not a stall/fail)**, surfaces the question, and feeds the answer back on the next stdin line.
- **Versioned machine write-sets.** Replace prose-derived `verify.rs` allow-lists with a JSON `writeSet` per skill, versioned with the plugin; on version mismatch, widen to "warn not breach" (so the quiz-file patch can't self-trip `ContractBreach`).
- **DONE sentinel + denials gate** is a backstop, not the only signal: require sentinel in `result_text` AND `permission_denials==[]` AND `expected_writes` mtime advanced. Missing sentinel + unchanged artifacts ⇒ surface, don't mutate.
- **Pin `--model`** so grading/rubric behavior is reproducible across users (don't inherit account default).

### 6.3 End-to-end sequence A — "Resume" on a module in Assess phase (generative)

State: `current={moduleId:"m03",phase:"assess"}`; `a04` `submitted`.
1. UI Resume → `deriveRoute` (local) finds (vii) → Assess(a04). UI → LIVE SESSION console, stage=Assess.
2. App snapshots fingerprint, **acquires heartbeat turn-lock**, writes `.bak`. Sends `lyceum:assess-understanding` turn (submission referenced by file path; ends `<<LYCEUM_DONE>>`).
3. Stream: `Init` → `TextDelta` (Feed-Up/Back/Forward) → `ToolUseStart{Read}`/`{Write}` → `result`.
4. **Drop lock; re-read manifest.** Say `m03-o1=0.88<0.90` → module stays `in-progress`, `phase="remediate"`; one new review seeded.
5. **Reload validator** passes (no impossible transition). `verify`: sentinel present, denials empty, a04 graded, mastery changed only on m03 objectives, module NOT flipped mastered (gate not cleared). PASS.
6. `deriveRoute(new)` → remediate → Teach(m03). Emit `manifest:changed`. UI shows graded feedback + "Mastery 84%→88%", roadmap node pulsing, "Next: re-teach m03-o1".

### 6.4 End-to-end sequence B — "Answer an MCQ" (deterministic, zero turns)

Pre-condition: `teach-lesson` already wrote `quizzes/m03-1718.json` (item lane-tagged).
1. QUIZ card renders from json; correct key withheld until submit.
2. User picks "B" → `grade_mcq(slug,quizId,itemId,"B")`. **No Claude turn.**
3. Rust reads quiz json, compares → correct. **Lane check (anti-corruption):**
   - **review lane** → apply Leitner (`leitner.rs`): pass ⇒ `box=min(box+1,6)`, recompute `due`; schedule-only write; calibration update if predicted. Local, allowed.
   - **assignment (mastery-bearing) lane** → do NOT grade locally; re-dispatch as `assess-understanding` (G) so the single-writer owns mastery.
   - **formative lane** → show rationale, write nothing mastery-bearing; optionally seed a Box1 review.
4. Return `{correct, rationale, masteryBefore/After (review/local lane only), nextItem}`. Atomic write if anything mutated. Card reveals correct highlight + "Correct — why" + delta bar + Next.

*Economy: generate once (A's teach turn), then drive many deterministic interactions locally (B), returning to Claude only for new judgment.*

---

## 7. Frontend (React + Vite + TS webview)

### 7.1 Token layer

`:root[data-theme="night"]` CSS variables — exact Night values; every component reads variables only, never literal hex. Neutrals (Canvas `#13110C` … Lamplight `#F2ECDC`), gold `#D8A23E`, **stage palette** (Research `#7CA0D6`, Curriculum `#D8A23E`, Teach `#BFB9AA`, Assign `#DB8A56`, Assess `#D17A7A`, Review `#6FB089`, Capstone `#DEB456`), fonts Newsreader (serif, long-form) + Hanken Grotesk (sans, tabular metrics), `lycPulse` keyframe, `--lamp` radial. `stages.ts` is the single phase→stage→accent map. `ThemeProvider` sets `data-theme` on `<html>`; Almanac/Momentum drop in by adding a `tokens.*.css` filling the same contract. Fonts via `@fontsource` (bundled locally — no Google CDN; tight CSP).

**State management split (CONFLICT RESOLVED): TanStack Query owns manifest/subject disk data** (cache keyed by slug, invalidated on `manifest:changed`); **Zustand owns only the ephemeral live-session stream.** *(One line: Query's cache+invalidation is the right fit for "disk is truth, re-render on change"; Zustand is minimal for the fast transient stream — use each where it shines rather than one store for both.)*

### 7.2 Component library

Mastery: `MasteryMeter` (linear-gradient + gate marker), `MasteryRing` (conic-gradient %), `MasterySeal` (earned gold / locked dashed). Chrome: `AppShell` (38 px `WindowChrome` "lyceum · learning/<slug>/ · local workspace", `Sidebar` 218 px, `MiniRail` 64 px), `StageChip`, `Button` (primary/outline/ghost/stage). Dashboard: `ResumeHero`, `StatGrid`, `SubjectCard`, `ReviewDueCard`. Roadmap: `RoadmapTimeline`/`RoadmapNode` (done=seal, active=pulsing ring, locked=dashed lock). Assess/Review: `QuizCard` (Assess band, idle/correct/wrong options, rationale, "58%→64%"), `ReviewCard` (Review band, recall dots, reveal, four SRS buttons with **`previewIntervals` from Rust Leitner**, NOT hardcoded). Reading: `LessonReader` (react-markdown + remark-gfm, Newsreader 19/1.7), `ArtifactView`. **New (live surface):** `SessionDrawer`, `SessionConsole`, `StreamMessage`, `ToolStep`, `ThinkingBlock`, `TurnStatusBar`, `PlacementRunner`, `CalibrationWidget`, `MasteryHeatmap`, `SubjectWizard`, `SettingsForm`. Keep every file < 500 lines.

### 7.3 Screen / route inventory

```
/                    → redirect /library
/library             → Dashboard (A): ResumeHero · StatGrid · SubjectCards · ReviewDueCard
/subject/:slug       → Roadmap (B): vertical timeline, mastery gates
/subject/:slug/research   → Research view (or LiveGenerating if absent)
/subject/:slug/placement  → PlacementRunner (app-driven adaptive loop)
/subject/:slug/lesson/:id → Lesson reading view (Newsreader long-form)
/subject/:slug/assess/:id → Assess (C-left): QuizCard, mastery transition
/subject/:slug/capstone   → Capstone (conversational sub-mode)
/review              → Review queue (C-right, cross-subject): ReviewCard + SRS buttons
/assignments · /today · /analytics · /settings
/new                 → onboarding wizard (subject → target → start/test)
```
The **LIVE SESSION surface** = a global, collapsible right-edge `SessionDrawer` (persists across nav, lives in `AppShell`) + inline `LiveGenerating` placeholder where a screen's artifact will appear. Both read `useEngineStore`.

### 7.4 Data binding

- `useManifest(slug)`/`useSubjects()` = TanStack Query over `read_manifest`/`list_subjects`. A single global `listen('manifest:changed', …)` invalidates the slug's query → every meter/ring/node re-renders from fresh disk. **No component polls.**
- Live-stream `claude://<slug>` events drive only `useEngineStore` (ephemeral). Disk-truth drives Query. They converge at `turn-end` + `manifest:changed`. **Mastery numbers are NEVER computed in the frontend** except the explicitly-transient optimistic preview from the Rust scorer; reconcile-on-`manifest:changed` always wins.
- **RED-TEAM FIX — cross-subject screens** (Dashboard/`/review`/`/today`/Analytics) read every manifest → use a cached `list_subjects()` **summary** command + debounced invalidation (avoid N file reads per render).
- **RED-TEAM FIX — long turn with no artifact write** (error/budget) must wire `turn-end:error` → retry affordance in `SessionDrawer` (never spin forever).
- Window chrome: Tauri `decorations:false` (or Overlay titlebar) + per-OS drag-region.

### 7.5 Tauri command surface (`#[tauri::command] async fn`, all `Result<T, AppError>`)

```
workspace_init/info · subject_list (summaries) · subject_open · subject_create
manifest_read · manifest_watch_start/stop · routing_next · progress_regenerate
claude_ensure/send_turn/cancel/shutdown/doctor   (events on claude://<slug>)
review_due · review_grade · review_stats          (deterministic, never delegated)
grade_mcq · submit_answer · run_step
theme_set/get · settings_get/set · open_path · reveal_in_os
```

---

## 8. Build Phases M0 → M4

### M0 — Scaffold (no Claude)
**Deliverables:** install rustup/cargo (NOT present); `npm create tauri-app` reconciled into the layout; **move landing page to `/site/`** + `pages.yml`; full serde `Manifest` + `load/save`; `srs`/`mastery`/`routing`/`ids`/`progress` as pure functions; engine-only commands (`load_manifest`, `list_subjects`, `compute_next_step`, `regenerate_progress`); Night `tokens.night.css` + mastery components + Dashboard reading a mock manifest; `ts-rs` codegen wired; CI (`cargo test`/`clippy -D warnings`/`fmt --check`/`pnpm build`/`vitest`).
**Acceptance:** `cargo test` green; `pnpm tauri dev` opens window titled "lyceum — learning/ — local workspace" rendering a Dashboard whose StatGrid + SubjectCard are computed from `fixtures/manifests/golden.json` matching hand-computed values. **Zero `claude` references in the codepath.**

### M1 — The bridge proven (DE-RISK THE RISKIEST UNKNOWN FIRST)
**Deliverables:** `workspace.rs::provision` (canonical realpath, stage+validate plugin, **`--plugin-dir`** as the chosen mechanism, MCP-isolation via private `CLAUDE_CONFIG_DIR`); `spawn.rs` (full argv + env scrub); `protocol.rs` (tolerant serde, `Unknown` variant); `session.rs` (session_id capture, `--resume`, turn state machine, watchdog); `events.rs` (`BridgeEvent`); React LIVE SESSION console; smoke turn ("List your skills; confirm `lyceum:learn`; print its description").
**Acceptance (two binary gates, BOTH required before any later milestone):**
- **Bridge gate:** smoke turn streams text deltas, ends with `result`; `session_id` captured; a follow-up `--resume` continues the same thread.
- **Skill gate:** reply explicitly names `learn` AND reproduces text only present in `references/MANIFEST.md` (e.g. the single-writer rule) — proving `${CLAUDE_PLUGIN_ROOT}` resolved (genuine load, not hallucinated). `init.mcp_servers==[]` and only-lyceum asserted. Capture committed as `fixtures/streams/skill-probe.jsonl`. **If the plugin strategy fails this gate, M1 isn't done.**

### M2 — One full vertical slice (single subject, real manifest)
**Deliverables:** `create_subject` + `run_step(slug, step)`; per-step cycle (routing validates legality → heartbeat lock → bridge drives the matching skill turn → Claude writes manifest/artifacts → core re-reads + reload-validator + deterministic post-processing it owns + regenerate `progress.md` → release lock → emit `manifest:changed`); **single-writer dev-assert** (pre/post manifest diff panics in dev if a non-assess/review turn changed mastery); mastery-gate UI (Assess card + roadmap node-state machine); Review/SRS UI (four buttons → `engine::srs` intervals, NOT Claude); **vendored skill forks** emitting `quizzes/*.json` + `placement-items.json`; `manifest::validate()` after every turn → `Err(ManifestDrift)` + "re-run step" UI on violation.
**Acceptance:** from empty `learning/`, a scripted run creates "Test Subject", completes m01 through assess with a passing submission, flips m01 `mastered`, unlocks m02 (prereq rule), and a review turn schedules a `reviewQueue` item with a future `due` matching the Leitner table. `validate()` passes at every checkpoint; `progress.md` non-empty. **Replays deterministically against the fake-claude harness in CI (no live Claude).**

### M3 — Breadth
**Deliverables:** multi-subject Dashboard (ResumeHero, 4-stat grid, SubjectCard grid with stage top-border); full Roadmap timeline; Analytics (calibration log, mastery-over-time, focused hrs from `history[]`, `MasteryHeatmap`); Placement screen (app-driven adaptive loop) + final delegation writing `placement{}`; Capstone screen (conversational sub-mode) + `certification`; onboarding wizard (levels table from `get_levels()`); Research + Lesson markdown views.
**Acceptance:** three subjects at different phases render correctly; Resume routes each per `engine::routing` (placement vs teach vs review vs capstone); Analytics reconcile with fixtures; placement and capstone runs each mutate the manifest and update screens without reload.

### M4 — Polish / packaging / cross-platform
**Deliverables:** bundle targets (macOS `.dmg`/`.app` codesign+notarize; Windows `.msi`/NSIS signtool; Linux `.AppImage`/`.deb`); `preflight()` (claude version check, multi-dir PATH resolution, blocking setup screen if absent); auto-update (`tauri-plugin-updater` against GitHub Releases); Windows spawn hardening (`CREATE_NO_WINDOW`, stdin newline normalization, `std::path`); Settings (session length, retention target, theme switch); CI matrix (macos/windows/ubuntu) producing signed artifacts + updater manifest.
**Acceptance:** signed installers built by CI on all three OSes; fresh-VM install launches, passes `preflight()`, completes the M2 slice against the user's **real** Claude login (manual smoke per OS); auto-update moves a stale build to current.

---

## 9. Testing Strategy

1. **Rust engine unit tests** (`lyceum-core`, headless, no claude): `srs` (ladder exactly `[1,3,7,16,35,90]`; pass→+1 box; box6→retired; fail→box1 due+1 lapses+1; Hard/Good/Easy never 2-box; `select_batch` clamp [8,15] most-overdue-no-topic-sort; `interleave` no consecutive same module); `mastery` (thresholds 0.90/0.85/0.85; band map; gate logic); `routing` (i–ix order; **branch vii scoped to current module — stale-submitted fixture**; remediate re-entry; `reviews_due` orthogonal); `ids` (max+1, padding, gap/dup robustness); `store` (round-trip byte-stable, atomic no-`.tmp`-survives, extra-field survival, corrupt→`Corrupt`, `ScaleStart::Test`/`Box_::Retired` (de)serialize, **reject box 0/7 as `Invalid`**); `concurrency` (stale-fingerprint→`Conflict`, seq-A retry re-applies onto fresh, **trybuild: no app-callable mastery setter**, heartbeat-lock staleness, canonical-fingerprint ignores key reorder); `progress` (`insta` snapshot); `date` (**midnight-boundary**); `roundtrip` (real MANIFEST example).
2. **Fake-claude replay harness** (`ClaudeProcess` trait behind the spawn boundary): real impl spawns the binary; fake **replays recorded `.jsonl`** frame-by-frame with realistic chunking and accepts stdin turns → M1/M2 tests deterministic & offline. **Add: split a stdout line across reads to prove buffering; feed garbage line to prove non-fatal skip.** `record-stream.mjs` refreshes fixtures. Nightly drift job diffs real-claude frame *shape* vs fixture.
3. **Schema-parity test** (`check-schema-parity.mjs` + Rust): the **`ts-rs`-generated** TS and Rust serde structs round-trip every fixture — the `gen:types && git diff --exit-code` CI gate catches drift automatically.
4. **Integration guards (red-team load-bearing):** (a) assert `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` absent in child env on **every spawn AND every `--resume`** (parse `init.apiKeySource=="none"`); (b) kill the child mid-`Write` → assert `.bak` recovery + no torn manifest; (c) assert `init.mcp_servers==[]` (isolation).
5. **Component tests** (Vitest + Testing Library): MasteryRing/Meter/Seal geometry per %, Roadmap node states from status, SRS buttons emit correct interval intents, Session console appends deltas in order.
6. **One e2e smoke** (`tauri-driver` + WebdriverIO): the M2 run through the real UI against fake-claude, asserting final manifest + on-screen mastery numbers. Runs in CI on Linux; the live-Claude variant is manual/nightly (auth-gated).

---

## 10. Prioritized Risk Register

| # | Risk (severity) | Mitigation (folded in) |
|---|---|---|
| 1 | **Skill loading in headless (highest).** `${CLAUDE_PLUGIN_ROOT}` binds only as a plugin; `--add-dir` breaks ref resolution. | **`--plugin-dir` chosen** (verified). M1 skill-gate is a hard blocker reproducing MANIFEST.md text. `SkillLoadStrategy` enum keeps fallbacks A/B-able. Reload validator HALTS if Claude wrote a non-conforming manifest. |
| 2 | **Multi-turn skills stall by default (SEV1).** placement/capstone/learn-setup are interactive; one-shot delegation hangs on `AskUserQuestion`. | Placement = app-driven loop over `placement-items.json` + one final write turn. Capstone/learn-setup = conversational sub-mode (console IS chat). Intercept `AskUserQuestion` as `NeedsInput`, not stall. |
| 3 | **`quizzes/*.json` written by no skill (SEV1).** QUIZ-card economy depends on a file the skills never emit. | Patch **vendored forks** of teach-lesson/assess to mandate the file; restate (not invent) in prompts. |
| 4 | **Billing leak (high).** claude prefers `ANTHROPIC_API_KEY`; would silently bill per-token. | `env_remove` both vars on every spawn+resume; `apiKeySource` runtime guard; integration test asserts absent. |
| 5 | **MCP/hook contamination (high, verified).** `--setting-sources project` is NOT hermetic. | Private `CLAUDE_CONFIG_DIR` for child; `--setting-sources project` only; doctor asserts `mcp_servers==[]` + only-lyceum; refuse otherwise. |
| 6 | **Misleading cost display (high, verified).** `total_cost_usd` is list-price even on Max. | Never show as a $ charge under `apiKeySource=="none"`; render tokens + quota; telemetry-only. |
| 7 | **Concurrency over-sold (critical).** Skills do last-writer-wins R-M-W; lockfile/fingerprint constrain only the app. | App NEVER writes manifest while a turn is dispatchable/in-flight; re-read after every turn; fingerprint = detection-not-prevention; reload validator rejects impossible states; heartbeat (not PID) lock. |
| 8 | **`module.status` double-writer (critical).** assess unlocks dependents AND app `recompute_availability`. | App availability is **read-only projection**; Claude (assess) is sole `module.status` writer. |
| 9 | **Resume-failure misclassification (high, verified).** Bad `--resume` exits 0, no `init`, error `result`. | Classify "error result + no init" as `ResumeFailed` → fresh-session fallback, NOT crash backoff. |
| 10 | **Quota = fake crash (high, verified).** Pool exhaustion looks like child death → restart storm. | Classify `overageStatus:rejected`/`out_of_credits` as `Quota`; suppress restart; quota banner + reset timer. |
| 11 | **No turn watchdog = permanent wedge (high).** No CLI timeout; hung turn freezes UI. | 120 s no-bytes idle timer (reset per line) → force `TurnResult{ok:false}`+kill+resume; 20 min wall-clock backstop. |
| 12 | **CWD-bound resume fragility (high, verified).** Symlinks/moves invalidate session_id. | Canonicalize (realpath) workspace once + freeze; store `claude_version`; fast-path fresh on mismatch. |
| 13 | **Key-order/format churn (high).** Claude's Edit reorders keys/reformats numbers → spurious conflicts/watcher storms. | Fingerprint over **canonical** (sorted-key, normalized-number) form; mtime/size only as watcher pre-filter. |
| 14 | **Half-written-file race (high).** Watcher reads mid-write → `Corrupt` on a healthy course. | Transient-vs-real corrupt: retry-with-backoff on watcher path; only user-load treats first corrupt as terminal. |
| 15 | **Wire-format drift (medium).** New frame fields across claude versions. | Tolerant serde (`#[serde(other)]`/`Unknown`); nightly real-vs-fixture shape diff; version-pin warn band. |
| 16 | **Contract-breach false positives (medium).** Prose write-sets drift; the quiz patch self-trips. | Versioned JSON `writeSet` per skill gated on plugin version; mismatch ⇒ warn-not-breach. |
| 17 | **Cross-platform spawn / not-installed (medium).** PATH/no-window/line-endings differ; binary may be absent. | `preflight()` multi-dir resolution + install screen; `CREATE_NO_WINDOW`; stdin newline normalization; CI matrix. |
| 18 | **Tool-arg assembly failure (medium).** Dropped fragment → `args:null`. | Tool frames exempt from coalescing/drop; fall back to assembled `assistant` block before `null`. |
| 19 | **Plugin-staging race (medium).** Half-copied plugin missing refs. | Stage lock + temp dir + tree validation + atomic rename + `.staged-version`; doctor re-validates. |
| 20 | **Quota exhaustion mid-course (medium).** Max pool empties; session exits on budget. | Watch `usage`/`stop_reason`/rate_limit; "resume later" state; `--resume`; steps re-runnable (state in manifest). |

---

## 11. Open Questions for the User (decisions still needed)

1. **Landing page `/site` vs `/docs`.** Prompt says `/site` (needs the `pages.yml` Actions workflow to keep the live URL). `/docs` is a zero-reconfig one-step alternative on legacy Pages. **Plan assumes `/site` + workflow** — confirm, or switch to `/docs`.
2. **Skill forks vs upstream.** We must ship **vendored forks** of `teach-lesson`/`assess`/`placement-test` to emit machine files (`quizzes/*.json`, `placement-items.json`). OK to fork the plugin under the app (decoupled from the chat-native plugin)? This is required for the QUIZ card and placement to function.
3. **Multi-active subjects.** Plan = single active subject per child, per-subject session, respawn-on-switch. Confirm we don't need true concurrent subjects (would need per-slug event namespacing — already in the design via `claude://<slug>`).
4. **`--model` pin.** Which model for reproducible grading/capstone scoring + cost budgeting (probe ran sonnet)? Affects `SpawnConfig.model`.
5. **Per-subject vs global theme.** Manifest has `settings.htmlTheme` per subject, but a desktop app usually wants one global theme. Which wins on cross-subject screens (Dashboard)?
6. **Quota behavior.** On `overageStatus:rejected`: block new turns with a reset banner (subscription-only stance), or offer an opt-in `ANTHROPIC_API_KEY` fallback (contradicts that stance)?
7. **Offline/degraded mode.** SRS/review + roadmap/manifest-read are fully app-deterministic and could work with claude unavailable. Is offline a product requirement (so engine availability isn't a hard gate)?
8. **Plugin update policy.** Restage on every launch / version mismatch only / never-touch-if-user-modified? Affects `workspace_init` provisioning.
9. **`AskUserQuestion` suppression.** Confirm whether v2.1.181 supports `--disallowed-tools`/`--strict-mcp-config`/empty `--mcp-config` (the isolation + intercept fixes depend on probing these before M1 sign-off).
10. **Backup granularity.** Single rolling `manifest.json.bak`, or a small ring of timestamped backups for corrupt-write recovery without a Claude repair turn?

---

## 12. Resolved Decisions (locked 2026-06-18)

| # | Question | Decision |
|---|---|---|
| 1 | Landing page location | **`/site` + `pages.yml` Actions workflow** (keeps the live github.io URL) |
| 2 | Skill machine-output | **Add to the skills themselves, upstreamable** (not app-only forks) — see new req below |
| 3 | Multi-subject sessions | **Per-subject isolated `claude` instance + session + memory** — see new req below |
| 4 | Pinned model | **`--model claude-opus-4-8`** |
| 5 | Theming | **One global theme** (Night default; Almanac/Momentum switchable in Settings) |
| 6 | Quota exhausted | **Block + reset-timer banner** (subscription-only; no API-key fallback) |
| 7 | Offline mode | **No — Claude is a hard dependency** (preflight gates launch) — see delta below |
| 8 | Plugin restage | **On version mismatch only** |
| 9 | Isolation flags | **Verify with a quick spike before M1** |
| 10 | Backups | **Ring of last 5 timestamped backups per subject** |

### New requirements & plan deltas from this round (authoritative — override earlier text where noted)

- **Per-subject isolation + automatic memory (refines §4.2, §5.7).** Every subject runs its **own isolated `claude` child process + session + workspace**; sessions never share context, so one subject can never confuse or disturb another. Additionally, each subject gets an **automatic memory**: a per-subject `learning/<slug>/.memory/notes.md` (one durable lesson per entry, learner-specific: recurring misconceptions, preferences, pacing) that the skills **append to as they work and re-read on resume**, isolated per subject. Add `memory` provisioning to `workspace.rs`, a "machine memory" instruction to the staged skills, and surface it read-only in the UI (Analytics / subject detail). Default still one warm session at a time (switch = resume), but isolation — not parallelism — is the hard requirement; concurrent warm sessions remain an allowed upgrade (events already keyed by `claude://<slug>`).
- **Skill machine-output lives in the skills, upstreamable (resolves Open-Q2).** Add the `quizzes/<mod>-<ts>.json` and `placement-items.json` "machine output" sections directly to `teach-lesson` / `assess-understanding` / `placement-test`, written to be contributed back to `Patryk-beep/lyceum`. The app **vendors that same skill source** into `src-tauri/resources/lyceum/`; there is no divergent app-only fork — the app's turn prompt restates a contract the skill owns. (Risk #3 mitigation updated accordingly.)
- **Claude is a hard dependency (overrides Risk #7 partial-offline framing, Open-Q7, and M4).** `preflight()` **BLOCKS app launch** if `claude` is missing or not logged in (shows a setup/locate screen). The deterministic engine still exists and is used everywhere, but there is **no degraded offline product mode** — engine availability is a launch gate. (Deterministic features remain the reason a quota-exhausted *running* session can still review/read — see Decision #6 — but a cold start with no Claude is blocked.)
- **Pre-M1 spike (resolves Open-Q9).** Before M1 sign-off, run a probe against the real `claude` v2.1.181 to confirm support for `--disallowed-tools`, `--strict-mcp-config`, and empty `--mcp-config`; lock the bridge flags to what's actually supported (fall back to runtime `AskUserQuestion` interception + private `CLAUDE_CONFIG_DIR` only where a flag is absent).
- **Backups (resolves Open-Q10).** Replace the single rolling `.bak` with `learning/<slug>/.backups/manifest-<ISO>.json`, keeping the **last 5** snapshots per subject (prune oldest). `store.rs::save` writes a snapshot before each successful atomic replace.

**Remaining open items (Open-Qs 3 & 5 are now resolved by Decisions #3/#5; none block M0–M1.)** All ten questions are answered; the only pre-build action is the pre-M1 isolation-flag spike (Decision #9) and installing the Rust toolchain for M0.
