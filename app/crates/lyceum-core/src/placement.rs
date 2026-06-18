//! The app-driven adaptive placement loop (PLACEMENT.md). Fully deterministic
//! floor/ceiling classification in Rust; the skill only supplies the item pool
//! (`placement-items.json`) and writes the final `placement{}` block.
//!
//! ```text
//! L = 3.5; step = 1.0
//! ask one item at tier round(L)
//! for each subsequent item (up to 10):
//!     correct -> L += step ; else -> L -= step
//!     step = max(0.25, step * 0.5)
//!     ask next at tier = clamp(round(L), 1, 6)
//!     stop early if passed >=2 at T and failed >=2 at T+1
//! ```

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementItem {
    pub id: String,
    pub tier: u8,
    pub stem: String,
    #[serde(default)]
    pub scoring_key: String,
    #[serde(rename = "type", default)]
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlacementPool {
    #[serde(default)]
    pub items: Vec<PlacementItem>,
}

pub const MAX_ITEMS: usize = 10;

/// Mutable state of an in-progress placement run.
#[derive(Debug, Clone)]
pub struct PlacementSession {
    level_estimate: f64,
    step: f64,
    asked: usize,
    /// (tier, correct) for each answered item.
    history: Vec<(u8, bool)>,
}

impl Default for PlacementSession {
    fn default() -> Self {
        Self {
            level_estimate: 3.5,
            step: 1.0,
            asked: 0,
            history: Vec::new(),
        }
    }
}

fn clamp_tier(l: f64) -> u8 {
    (l.round() as i64).clamp(1, 6) as u8
}

impl PlacementSession {
    pub fn new() -> Self {
        Self::default()
    }

    /// The tier to ask next, or `None` if the run is complete.
    pub fn next_tier(&self) -> Option<u8> {
        if self.is_done() {
            None
        } else {
            Some(clamp_tier(self.level_estimate))
        }
    }

    /// Record the outcome of the item just asked (at `next_tier`).
    pub fn record(&mut self, correct: bool) {
        let tier = clamp_tier(self.level_estimate);
        self.history.push((tier, correct));
        self.asked += 1;
        if correct {
            self.level_estimate += self.step;
        } else {
            self.level_estimate -= self.step;
        }
        self.step = (self.step * 0.5).max(0.25);
    }

    pub fn is_done(&self) -> bool {
        self.asked >= MAX_ITEMS || self.bracketed().is_some()
    }

    /// If a floor/ceiling bracket exists (>=2 passed at T and >=2 failed at T+1),
    /// returns that floor tier.
    fn bracketed(&self) -> Option<u8> {
        for t in 1..=5u8 {
            let passed_at_t = self
                .history
                .iter()
                .filter(|(tier, ok)| *tier == t && *ok)
                .count();
            let failed_at_next = self
                .history
                .iter()
                .filter(|(tier, ok)| *tier == t + 1 && !*ok)
                .count();
            if passed_at_t >= 2 && failed_at_next >= 2 {
                return Some(t);
            }
        }
        None
    }

    /// Recommended starting level: one notch below the ceiling (the floor), clamped
    /// to 1..=6. Uses the bracket if found, else the highest sustained tier.
    pub fn recommended_level(&self) -> u8 {
        if let Some(floor) = self.bracketed() {
            return floor.clamp(1, 6);
        }
        // Fallback: highest tier with a pass, but never above a tier that broke.
        let highest_pass = self
            .history
            .iter()
            .filter(|(_, ok)| *ok)
            .map(|(t, _)| *t)
            .max();
        let lowest_fail = self
            .history
            .iter()
            .filter(|(_, ok)| !*ok)
            .map(|(t, _)| *t)
            .min();
        match (highest_pass, lowest_fail) {
            (Some(p), Some(f)) => p.min(f.saturating_sub(1).max(1)).clamp(1, 6),
            (Some(p), None) => p.clamp(1, 6),
            (None, _) => 1,
        }
    }

    pub fn asked(&self) -> usize {
        self.asked
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_mid_range() {
        let s = PlacementSession::new();
        assert_eq!(s.next_tier(), Some(4)); // round(3.5) = 4
    }

    #[test]
    fn converges_down_on_failures() {
        let mut s = PlacementSession::new();
        // Fail everything -> estimate drops toward 1.
        for _ in 0..MAX_ITEMS {
            if s.is_done() {
                break;
            }
            s.record(false);
        }
        assert!(s.is_done());
        assert_eq!(s.recommended_level(), 1);
    }

    #[test]
    fn step_shrinks_and_caps_at_ten() {
        let mut s = PlacementSession::new();
        for i in 0..20 {
            if s.is_done() {
                assert_eq!(s.asked(), MAX_ITEMS);
                break;
            }
            s.record(i % 2 == 0);
        }
        assert!(s.asked() <= MAX_ITEMS);
    }

    #[test]
    fn brackets_floor_and_ceiling_early() {
        // Sustain tier 2 (2 passes), break at tier 3 (2 fails) -> floor 2.
        let mut s = PlacementSession {
            level_estimate: 2.0,
            step: 0.0, // freeze tier at 2 for deterministic setup
            asked: 0,
            history: vec![],
        };
        s.record(true); // tier 2 pass
        s.record(true); // tier 2 pass
                        // now move to tier 3 manually
        s.level_estimate = 3.0;
        s.record(false); // tier 3 fail
        s.record(false); // tier 3 fail
        assert_eq!(s.bracketed(), Some(2));
        assert!(s.is_done());
        assert_eq!(s.recommended_level(), 2);
    }

    #[test]
    fn pool_parses_machine_output() {
        let json = r#"{"items":[{"id":"p1","tier":2,"stem":"q","scoringKey":"a","type":"short"}]}"#;
        let pool: PlacementPool = serde_json::from_str(json).unwrap();
        assert_eq!(pool.items.len(), 1);
        assert_eq!(pool.items[0].tier, 2);
        assert_eq!(pool.items[0].kind, "short");
    }
}
