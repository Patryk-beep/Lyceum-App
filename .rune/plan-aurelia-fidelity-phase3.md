# Phase 3 — Study streak (pure helper + command + card)

**Goal:** a cross-subject "Days at Study" streak, computed in a pure tested core helper.

## Data flow
```
manifests/*/manifest.json (history[].date)
  → service::study_streak: union dates across list_slugs(ws)
  → lyceum_core::streak::current_streak(&[Date], today) -> u32
  → StreakInfo { current, longest, lastActive } → study_streak() cmd → StreakCard.tsx
```

## Code contracts
```rust
// lyceum-core/src/streak.rs  (PURE)
pub struct StreakInfo { pub current: u32, pub longest: u32, pub last_active: Option<String> }
pub fn current_streak(dates: &[time::Date], today: time::Date) -> u32;
pub fn streak_info(dates: &[time::Date], today: time::Date) -> StreakInfo;
```
```rust
// src-tauri: service::study_streak(ws, today) -> StreakInfo ; command study_streak() -> StreakInfo
```
```ts
// StreakCard.tsx
export function StreakCard({ days }: { days: number }): JSX.Element  // "<n> · unbroken"
```

## Algorithm (pin exactly)
`current_streak`: dedup `dates` into a sorted set of civil `Date`s. Start `cursor = today`; if `today`
is NOT in the set but `today-1` IS, set `cursor = today-1` (a fresh morning before studying still keeps
the streak). Then walk backward: while `cursor ∈ set` → `count++; cursor -= 1 day`. Return `count`.
Empty input → 0. `study_streak` unions `HistoryEntry.date` across every slug from `workspace::list_slugs`,
passes `workspace::today()` (UTC — document the boundary in a comment).

## Tasks
1. **`crates/lyceum-core/src/streak.rs`** + `pub mod streak;` in lib.rs. Implement both fns. `StreakInfo` serde camelCase.
2. **`src-tauri/src/service.rs`** — `study_streak(ws, today) -> AppResult<StreakInfo>` (read each manifest, collect history dates).
3. **`src-tauri/src/commands.rs`** — `#[tauri::command] study_streak(state) -> StreakInfo`; register in lib.rs.
4. **`src/components/StreakCard.tsx`** + CSS (tokens only). **`src/lib/ipc.ts`** + `useStreak` hook in `query.ts`.

## Failure scenarios
| When | Then |
|---|---|
| today no entry, yesterday has | streak counts from yesterday (not 0) |
| same date in 2 subjects | counts once (set dedup) |
| gap of ≥1 missing day | streak stops at the gap |
| empty / no history | 0 |
| future-dated entry | ignored (cursor starts at today, walks back) |

## Rejection criteria
- DO NOT compute the streak in TS from raw history (keep it in the tested pure helper).
- DO NOT count a day twice for multiple same-day events. DO NOT use literal hex in StreakCard CSS.

## Acceptance gates
- `cargo test -p lyceum-core streak` green (5 cases below). `cargo test -p lyceum-app` green.
- StreakCard renders the day count.

## Tests (Rust)
empty→0; single day = today→1; gap breaks (today, today-1, today-3 → 2); today missing + yesterday
present→counts from yesterday; same date across two subjects counts once.

## Cross-phase
- **Assumes:** nothing. **Exports:** `study_streak` command + `StreakCard` for P4 sidebar.
